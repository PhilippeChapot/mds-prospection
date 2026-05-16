/**
 * P6.x.1b-β — handler dédié au flow Stripe `flow=supplementary`.
 *
 * Invoqué depuis lib/stripe/webhook-handler.ts dès qu'un
 * `checkout.session.completed` arrive avec metadata.flow === 'supplementary'.
 *
 * Idempotence :
 *   - On UPDATE supplementary_orders SET status='paid' WHERE status='pending'
 *     AND id=X. Si déjà en 'paid' → no-op (count rows updated = 0). On log
 *     et on return early.
 *   - Le webhook Stripe lui-même est dédupliqué amont via stripe_events_processed
 *     (déjà en place dans le route handler).
 *
 * Best-effort sur facture / emails / Brevo : si l'un échoue, on continue
 * pour ne pas bloquer la suite (la commande est payée, c'est l'essentiel).
 */

import type Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { createSupplementaryFacture } from '@/lib/sellsy/create-supplementary-facture';
import {
  renderClientSupplementaryConfirmation,
  renderAdminSupplementaryReceived,
  type SupplementaryItemRow,
} from '@/lib/resend/templates/supplementary-orders';

const LOG_PREFIX = '[supplementary/webhook]';

const BREVO_API_BASE = 'https://api.brevo.com/v3';

interface OrderRow {
  id: string;
  prospect_id: string;
  // JSONB → typé `unknown` côté DB types. Cast vers SupplementaryItemRow[]
  // au moment de l'utilisation (snapshot écrit par actions.ts en P6.x.1b-α).
  items: unknown;
  total_ht_eur: number | string;
  total_ttc_eur: number | string;
  vat_rate: number | string;
  status: string;
}

interface ProspectRow {
  id: string;
  primary_contact_email: string | null;
  primary_contact_first_name: string | null;
  company_name: string;
  company_sellsy_id: string | null;
}

export async function handleSupplementaryCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = session.metadata?.supplementary_order_id;
  const prospectIdFromMeta = session.metadata?.prospect_id;
  if (!orderId) {
    console.error('%s no-order-id session=%s', LOG_PREFIX, session.id);
    return;
  }
  if (session.payment_status !== 'paid') {
    console.log(
      '%s not-paid session=%s status=%s — ignore',
      LOG_PREFIX,
      session.id,
      session.payment_status,
    );
    return;
  }

  const supabase = getSupabaseServiceClient();

  // 1. Idempotent UPDATE : pending → paid. Si déjà paid, count=0, on skip.
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null;
  const { data: updated, error: updErr } = await supabase
    .from('supplementary_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('id', orderId)
    .eq('status', 'pending') // garde l'idempotence
    .select('id');

  if (updErr) {
    console.error('%s update-failed order=%s msg=%s', LOG_PREFIX, orderId, updErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log('%s already-paid-or-missing order=%s — skip post-pay actions', LOG_PREFIX, orderId);
    return;
  }

  console.log('%s marked-paid order=%s', LOG_PREFIX, orderId);

  // 2. Re-fetch order full + prospect snapshot
  const { data: orderRaw } = await supabase
    .from('supplementary_orders')
    .select('id, prospect_id, items, total_ht_eur, total_ttc_eur, vat_rate, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!orderRaw) {
    console.error('%s order-missing-after-update order=%s', LOG_PREFIX, orderId);
    return;
  }
  const order = orderRaw as OrderRow;

  const { data: prospectRow } = await supabase
    .from('prospects')
    .select(
      `id,
       contact:contacts!primary_contact_id(email, first_name),
       company:companies!inner(name, sellsy_id)`,
    )
    .eq('id', order.prospect_id)
    .maybeSingle();
  if (!prospectRow) {
    console.error(
      '%s prospect-missing order=%s prospect=%s',
      LOG_PREFIX,
      orderId,
      order.prospect_id,
    );
    return;
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const contact = pickOne(prospectRow.contact);
  const company = pickOne(prospectRow.company);
  const prospect: ProspectRow = {
    id: prospectRow.id,
    primary_contact_email: contact?.email ?? null,
    primary_contact_first_name: contact?.first_name ?? null,
    company_name: company?.name ?? '(société inconnue)',
    company_sellsy_id: company?.sellsy_id ?? null,
  };

  const items = Array.isArray(order.items) ? (order.items as SupplementaryItemRow[]) : [];
  const totalHt = Number(order.total_ht_eur);
  const totalTtc = Number(order.total_ttc_eur);
  const vatRate = Number(order.vat_rate);

  // 3. Facture Sellsy (best-effort)
  let factureNumber: string | null = null;
  let facturePublicUrl: string | null = null;
  if (prospect.company_sellsy_id) {
    const sellsyResult = await createSupplementaryFacture({
      orderId,
      companysSellsyId: Number(prospect.company_sellsy_id),
      items,
      label: `Commande complémentaire MDS — ${orderId.slice(0, 8)}`,
    });
    if (sellsyResult.ok && sellsyResult.facture_id) {
      factureNumber = sellsyResult.facture_number ?? null;
      facturePublicUrl = sellsyResult.facture_public_url ?? null;
      await supabase
        .from('supplementary_orders')
        .update({
          sellsy_facture_id: sellsyResult.facture_id,
          sellsy_facture_number: factureNumber,
        })
        .eq('id', orderId);
    } else {
      console.warn(
        '%s facture-skipped order=%s err=%s',
        LOG_PREFIX,
        orderId,
        sellsyResult.error ?? 'unknown',
      );
    }
  } else {
    console.warn('%s no-company-sellsy-id order=%s — facture non créée', LOG_PREFIX, orderId);
  }

  // 4. Email confirmation client
  if (prospect.primary_contact_email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const orderDetailUrl = `${appUrl}/fr/espace-exposant/dashboard/commandes/${orderId}`;
      const tpl = renderClientSupplementaryConfirmation({
        contactFirstName: prospect.primary_contact_first_name,
        companyName: prospect.company_name,
        orderId,
        items,
        totalHt,
        totalTtc,
        vatRate,
        paidAt: new Date().toISOString(),
        factureNumber,
        facturePublicUrl,
        orderDetailUrl,
        appUrl,
      });
      await sendTransactionalEmailViaResend({
        to: prospect.primary_contact_email,
        toName: prospect.primary_contact_first_name ?? prospect.company_name,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: 'category', value: 'client_supplementary_confirmation' }],
      });
    } catch (err) {
      console.error(
        '%s client-email-failed order=%s msg=%s',
        LOG_PREFIX,
        orderId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 5. Email notification admin
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const prospectUrl = `${appUrl}/admin/prospects/${prospect.id}`;
    const tpl = renderAdminSupplementaryReceived({
      prospectId: prospect.id,
      prospectUrl,
      companyName: prospect.company_name,
      contactEmail: prospect.primary_contact_email ?? '(email inconnu)',
      orderId,
      items,
      totalHt,
      totalTtc,
      paidAt: new Date().toISOString(),
      factureNumber,
      facturePublicUrl,
      stripeSessionId: session.id ?? null,
      stripePaymentIntentId: paymentIntentId,
    });
    await sendAdminNotification('admin_supplementary_received', tpl);
  } catch (err) {
    console.error(
      '%s admin-email-failed order=%s msg=%s',
      LOG_PREFIX,
      orderId,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Brevo lifecycle : ajout à la liste EXPOSANT_COMMANDE_SUPPLEMENTAIRE
  await addToSupplementaryBrevoList(prospect.primary_contact_email).catch((err) => {
    console.warn(
      '%s brevo-add-failed order=%s msg=%s',
      LOG_PREFIX,
      orderId,
      err instanceof Error ? err.message : String(err),
    );
  });

  console.log(
    '%s done order=%s prospect=%s prospectId_meta_match=%s',
    LOG_PREFIX,
    orderId,
    prospect.id,
    prospectIdFromMeta === prospect.id,
  );
}

async function addToSupplementaryBrevoList(email: string | null): Promise<void> {
  if (!email) return;
  const apiKey = process.env.BREVO_API_KEY;
  const listIdRaw = process.env.BREVO_LIST_ID_EXPOSANT_COMMANDE_SUPPLEMENTAIRE;
  if (!apiKey || !listIdRaw) {
    console.log('%s brevo-skip-no-config email=%s', LOG_PREFIX, email);
    return;
  }
  const listId = Number.parseInt(listIdRaw, 10);
  if (!Number.isFinite(listId)) return;

  const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ emails: [email] }),
  });
  if (!res.ok && res.status !== 400) {
    // 400 = often "contact already in list" → no-op
    const body = await res.text().catch(() => '');
    console.warn('%s brevo-list-add http=%d body=%s', LOG_PREFIX, res.status, body.slice(0, 200));
  } else {
    console.log('%s brevo-added email=%s list=%d', LOG_PREFIX, email, listId);
  }
}
