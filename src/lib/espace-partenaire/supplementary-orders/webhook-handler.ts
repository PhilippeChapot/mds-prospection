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
  /** P6.x.1b-γ : si true, on skip facture Sellsy / email client / Brevo.
   *  Permet de tester le flow en LIVE sans créer de vraie facture (qui
   *  demanderait un avoir comptable pour annuler). Seul l'email admin
   *  est envoyé, préfixé [TEST] pour clarté. */
  is_test: boolean;
  primary_contact_email: string | null;
  primary_contact_first_name: string | null;
  company_name: string;
  company_sellsy_id: string | null;
}

/**
 * P6.x.1b-β — wrapper Stripe : extrait order_id/payment_intent du
 * checkout.session.completed et délègue à processPaidSupplementaryOrder.
 *
 * Garde la séparation entre le contexte Stripe (validation payment_status,
 * extraction metadata) et la logique métier post-paiement (réutilisable par
 * l'endpoint admin debug en P6.x.1b-δ).
 */
export async function handleSupplementaryCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = session.metadata?.supplementary_order_id;
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
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null;
  await processPaidSupplementaryOrder(orderId, {
    stripePaymentIntentId: paymentIntentId,
    stripeSessionId: session.id ?? null,
  });
}

export interface ProcessPaidContext {
  stripePaymentIntentId: string | null;
  stripeSessionId?: string | null;
}

export interface ProcessPaidResult {
  /** 'paid' = transition pending→paid effectuée et side-effects exécutés.
   *  'already_paid' = déjà payé (idempotent skip).
   *  'not_found' = order introuvable après l'UPDATE (cas pathologique). */
  status: 'paid' | 'already_paid' | 'not_found';
  order_id: string;
  sellsy_facture_id: number | null;
  sellsy_facture_number: string | null;
  /** Détail des side-effects (utile pour debug + tests). */
  side_effects: {
    facture_skipped: boolean;
    facture_skipped_reason: 'is_test' | 'no_sellsy_id' | 'sellsy_error' | null;
    email_client_skipped: boolean;
    email_client_skipped_reason: 'is_test' | 'no_email' | null;
    admin_email_test_prefix: boolean;
    brevo_skipped: boolean;
    brevo_skipped_reason: 'is_test' | 'no_email' | 'no_config' | null;
  };
}

/**
 * P6.x.1b-δ — logique post-paiement réutilisable, indépendante de Stripe.
 *
 * Invoquée par :
 *   - handleSupplementaryCheckoutCompleted (webhook Stripe LIVE)
 *   - POST /api/admin/debug/supplementary/[id]/simulate-paid (admin debug)
 *
 * Idempotente : UPDATE .eq('status', 'pending') + .select retourne 0 rows
 * si déjà payé → skip tous les side-effects.
 *
 * Side-effects gates is_test (P6.x.1b-γ) :
 *   - prospect.is_test=true → skip facture + email client + Brevo
 *   - prospect.is_test=true → admin email subject préfixé [TEST]
 */
export async function processPaidSupplementaryOrder(
  orderId: string,
  ctx: ProcessPaidContext,
): Promise<ProcessPaidResult> {
  const supabase = getSupabaseServiceClient();
  const result: ProcessPaidResult = {
    status: 'not_found',
    order_id: orderId,
    sellsy_facture_id: null,
    sellsy_facture_number: null,
    side_effects: {
      facture_skipped: false,
      facture_skipped_reason: null,
      email_client_skipped: false,
      email_client_skipped_reason: null,
      admin_email_test_prefix: false,
      brevo_skipped: false,
      brevo_skipped_reason: null,
    },
  };

  // 1. Idempotent UPDATE : pending → paid. Si déjà paid, count=0, on skip.
  const { data: updated, error: updErr } = await supabase
    .from('supplementary_orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: ctx.stripePaymentIntentId,
    })
    .eq('id', orderId)
    .eq('status', 'pending') // garde l'idempotence
    .select('id');

  if (updErr) {
    console.error('%s update-failed order=%s msg=%s', LOG_PREFIX, orderId, updErr.message);
    return result;
  }
  if (!updated || updated.length === 0) {
    console.log('%s already-paid-or-missing order=%s — skip post-pay actions', LOG_PREFIX, orderId);
    result.status = 'already_paid';
    return result;
  }

  result.status = 'paid';
  console.log('%s marked-paid order=%s', LOG_PREFIX, orderId);

  // 2. Re-fetch order full + prospect snapshot
  const { data: orderRaw } = await supabase
    .from('supplementary_orders')
    .select('id, prospect_id, items, total_ht_eur, total_ttc_eur, vat_rate, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!orderRaw) {
    console.error('%s order-missing-after-update order=%s', LOG_PREFIX, orderId);
    return result;
  }
  const order = orderRaw as OrderRow;

  const { data: prospectRow } = await supabase
    .from('prospects')
    .select(
      `id, is_test,
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
    return result;
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const contact = pickOne(prospectRow.contact);
  const company = pickOne(prospectRow.company);
  const prospect: ProspectRow = {
    id: prospectRow.id,
    is_test: Boolean(prospectRow.is_test),
    primary_contact_email: contact?.email ?? null,
    primary_contact_first_name: contact?.first_name ?? null,
    company_name: company?.name ?? '(société inconnue)',
    company_sellsy_id: company?.sellsy_id ?? null,
  };

  if (prospect.is_test) {
    console.log(
      '%s test-mode-detected order=%s prospect=%s — skip facture/email-client/brevo, admin email préfixé [TEST]',
      LOG_PREFIX,
      orderId,
      prospect.id,
    );
  }

  const items = Array.isArray(order.items) ? (order.items as SupplementaryItemRow[]) : [];
  const totalHt = Number(order.total_ht_eur);
  const totalTtc = Number(order.total_ttc_eur);
  const vatRate = Number(order.vat_rate);

  // 3. Facture Sellsy (best-effort). P6.x.1b-γ : skip si prospect.is_test
  //    pour éviter de créer une vraie facture comptable lors d'un test
  //    LIVE — sinon il faudrait émettre un avoir pour l'annuler.
  let factureNumber: string | null = null;
  let facturePublicUrl: string | null = null;
  if (prospect.is_test) {
    console.log('%s facture-skipped order=%s reason=is_test', LOG_PREFIX, orderId);
    result.side_effects.facture_skipped = true;
    result.side_effects.facture_skipped_reason = 'is_test';
  } else if (prospect.company_sellsy_id) {
    const sellsyResult = await createSupplementaryFacture({
      orderId,
      companysSellsyId: Number(prospect.company_sellsy_id),
      items,
      label: `Commande complémentaire MDS — ${orderId.slice(0, 8)}`,
    });
    if (sellsyResult.ok && sellsyResult.facture_id) {
      factureNumber = sellsyResult.facture_number ?? null;
      facturePublicUrl = sellsyResult.facture_public_url ?? null;
      result.sellsy_facture_id = sellsyResult.facture_id;
      result.sellsy_facture_number = factureNumber;
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
      result.side_effects.facture_skipped = true;
      result.side_effects.facture_skipped_reason = 'sellsy_error';
    }
  } else {
    console.warn('%s no-company-sellsy-id order=%s — facture non créée', LOG_PREFIX, orderId);
    result.side_effects.facture_skipped = true;
    result.side_effects.facture_skipped_reason = 'no_sellsy_id';
  }

  // 4. Email confirmation client. P6.x.1b-γ : skip si is_test pour éviter
  //    d'envoyer un faux mail à un vrai client lors d'un test LIVE.
  if (prospect.is_test) {
    console.log(
      '%s client-email-skipped order=%s reason=is_test email=%s',
      LOG_PREFIX,
      orderId,
      prospect.primary_contact_email ?? '-',
    );
    result.side_effects.email_client_skipped = true;
    result.side_effects.email_client_skipped_reason = 'is_test';
  } else if (prospect.primary_contact_email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const orderDetailUrl = `${appUrl}/fr/espace-partenaire/dashboard/commandes/${orderId}`;
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
  } else {
    result.side_effects.email_client_skipped = true;
    result.side_effects.email_client_skipped_reason = 'no_email';
  }

  // 5. Email notification admin. P6.x.1b-γ : préfixe [TEST] dans le sujet
  //    si is_test pour signaler clairement qu'il n'y a PAS de facture/email
  //    client/Brevo associés (test technique uniquement).
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
      stripeSessionId: ctx.stripeSessionId ?? null,
      stripePaymentIntentId: ctx.stripePaymentIntentId,
    });
    const adminTpl = prospect.is_test ? { ...tpl, subject: `[TEST] ${tpl.subject}` } : tpl;
    if (prospect.is_test) result.side_effects.admin_email_test_prefix = true;
    await sendAdminNotification('admin_supplementary_received', adminTpl);
  } catch (err) {
    console.error(
      '%s admin-email-failed order=%s msg=%s',
      LOG_PREFIX,
      orderId,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Brevo lifecycle : ajout à la liste EXPOSANT_COMMANDE_SUPPLEMENTAIRE.
  //    P6.x.1b-γ : skip si is_test pour éviter de polluer les automations
  //    Brevo (qui pourraient déclencher un drip de remerciement).
  if (prospect.is_test) {
    console.log('%s brevo-skipped order=%s reason=is_test', LOG_PREFIX, orderId);
    result.side_effects.brevo_skipped = true;
    result.side_effects.brevo_skipped_reason = 'is_test';
  } else if (!prospect.primary_contact_email) {
    result.side_effects.brevo_skipped = true;
    result.side_effects.brevo_skipped_reason = 'no_email';
  } else {
    const brevoResult = await addToSupplementaryBrevoList(prospect.primary_contact_email).catch(
      (err) => {
        console.warn(
          '%s brevo-add-failed order=%s msg=%s',
          LOG_PREFIX,
          orderId,
          err instanceof Error ? err.message : String(err),
        );
        return { skipped: false } as const;
      },
    );
    if (brevoResult && brevoResult.skipped) {
      result.side_effects.brevo_skipped = true;
      result.side_effects.brevo_skipped_reason = 'no_config';
    }
  }

  console.log('%s done order=%s prospect=%s', LOG_PREFIX, orderId, prospect.id);
  return result;
}

async function addToSupplementaryBrevoList(email: string | null): Promise<{ skipped: boolean }> {
  if (!email) return { skipped: true };
  const apiKey = process.env.BREVO_API_KEY;
  const listIdRaw = process.env.BREVO_LIST_ID_EXPOSANT_COMMANDE_SUPPLEMENTAIRE;
  if (!apiKey || !listIdRaw) {
    console.log('%s brevo-skip-no-config email=%s', LOG_PREFIX, email);
    return { skipped: true };
  }
  const listId = Number.parseInt(listIdRaw, 10);
  if (!Number.isFinite(listId)) return { skipped: true };

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
  return { skipped: false };
}
