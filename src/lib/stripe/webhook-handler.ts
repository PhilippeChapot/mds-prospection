/**
 * Webhook handler Stripe — logique metier separee de la route HTTP.
 *
 * Appele depuis app/api/webhooks/stripe/route.ts apres :
 *   1. Verification de la signature Stripe (constructEvent)
 *   2. Idempotence (INSERT stripe_events_processed ON CONFLICT DO NOTHING)
 *
 * Cette factorisation permet de tester la logique sans monter une
 * vraie requete HTTP cote Vitest.
 *
 * Logs structures (prefix [stripe/webhook]).
 */

import type Stripe from 'stripe';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notifySellsyPaymentReceived } from '@/lib/sellsy/payments';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import type { Database } from '@/lib/supabase/database.types';
import {
  renderAdminAcomptePayeEmail,
  renderAdminAcompteEchecEmail,
  renderAdminConciergePayeEmail,
} from '@/lib/resend/templates/admin-payment';
import { calculatePaymentStatus } from '@/lib/prospects/calculate-payment-status';

type ProspectUpdate = Database['public']['Tables']['prospects']['Update'];

const LOG_PREFIX = '[stripe/webhook]';

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  console.log('%s dispatch type=%s id=%s', LOG_PREFIX, event.type, event.id);

  switch (event.type) {
    case 'checkout.session.completed':
      // P4.x.1 Bug A : handler unique pour les paiements reussis (succes
      // Checkout = succes Payment Link aussi, Stripe envoie tjs l'event
      // checkout.session.completed avant payment_intent.succeeded).
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'payment_intent.succeeded':
      // Bug A : passthrough log seulement. Stripe envoie cet event en
      // doublon de checkout.session.completed pour tout paiement Card -
      // on ne re-traite pas pour eviter le double email admin.
      console.log(
        '%s pi-succeeded-passthrough id=%s pi=%s — already handled via checkout.session.completed',
        LOG_PREFIX,
        event.id,
        (event.data.object as Stripe.PaymentIntent).id,
      );
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    default:
      console.log('%s unhandled-type type=%s id=%s — ignore', LOG_PREFIX, event.type, event.id);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const prospectId = session.metadata?.prospect_id;
  const sellsyDocId = session.metadata?.sellsy_document_id || null;
  // P4.x.1 Bug B : route le template admin via metadata.flow injecte cote
  // helpers (acompte/integral pour Checkout, concierge pour Payment Link).
  // Fallback sur la deduction depuis source/type pour les liens crees
  // avant l'introduction de flow (retrocompat).
  const flow =
    (session.metadata?.flow as 'acompte' | 'integral' | 'concierge' | undefined) ??
    (session.metadata?.source === 'admin_concierge' ? 'concierge' : undefined) ??
    'acompte';
  const type =
    (session.metadata?.type as 'acompte_30pct' | 'integral' | 'concierge' | undefined) ??
    (flow === 'concierge' ? 'concierge' : flow === 'integral' ? 'integral' : 'acompte_30pct');

  if (!prospectId) {
    console.error('%s checkout-completed-no-prospect-id session=%s', LOG_PREFIX, session.id);
    return;
  }
  if (session.payment_status !== 'paid') {
    console.log(
      '%s checkout-completed-not-paid session=%s status=%s',
      LOG_PREFIX,
      session.id,
      session.payment_status,
    );
    return;
  }

  const amountCents = session.amount_total ?? 0;
  const amountEur = amountCents / 100;
  await markProspectPaid(prospectId, type, {
    sellsyDocId,
    amountEur,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    sessionId: session.id,
    flow,
  });
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const prospectId = intent.metadata?.prospect_id;
  if (!prospectId) {
    console.log('%s pi-failed-no-prospect-id pi=%s — ignore', LOG_PREFIX, intent.id);
    return;
  }
  const amountEur = (intent.amount ?? 0) / 100;
  const errorMessage = intent.last_payment_error?.message ?? 'Erreur inconnue';

  console.error(
    '%s payment-failed prospect=%s pi=%s msg=%s',
    LOG_PREFIX,
    prospectId,
    intent.id,
    errorMessage,
  );

  // Notif admin echec — pas de maj DB du statut prospect (on ne change rien
  // si paiement echoue, le prospect peut retenter).
  const flow =
    (intent.metadata?.flow as 'acompte' | 'integral' | 'concierge' | undefined) ??
    (intent.metadata?.source === 'admin_concierge' ? 'concierge' : 'acompte');
  await sendAdminEmail({
    prospectId,
    paymentType:
      (intent.metadata?.type as 'acompte_30pct' | 'integral' | 'concierge' | undefined) ??
      'concierge',
    amountEur,
    success: false,
    paymentIntentId: intent.id,
    sessionId: null,
    errorMessage,
    flow,
  });
}

interface MarkPaidContext {
  sellsyDocId: string | null;
  amountEur: number;
  paymentIntentId: string | null;
  sessionId: string | null;
  /** P4.x.1 Bug B : route le template admin (concierge vs acompte). */
  flow: 'acompte' | 'integral' | 'concierge';
}

async function markProspectPaid(
  prospectId: string,
  type: 'acompte_30pct' | 'integral' | 'concierge',
  ctx: MarkPaidContext,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // P4.x.2 sujet C : calcule le status auto selon paid_pct (cumul vs total TTC).
  // Lookup acompte_amount_eur (cumul precedent) + sellsy_devis_total_ttc.
  const { data: existing } = await supabase
    .from('prospects')
    .select('acompte_amount_eur, sellsy_devis_total_ttc')
    .eq('id', prospectId)
    .maybeSingle();

  const previousPaid = Number(existing?.acompte_amount_eur ?? 0);
  const cumulativePaid = previousPaid + ctx.amountEur;
  const devisTotalTtc = existing?.sellsy_devis_total_ttc
    ? Number(existing.sellsy_devis_total_ttc)
    : null;
  const computedStatus = calculatePaymentStatus(cumulativePaid, devisTotalTtc);

  // 1. UPDATE prospect : status auto + acompte_paid_at + cumul + sync indicator.
  const now = new Date().toISOString();
  const updates: ProspectUpdate = {
    status: computedStatus,
    acompte_status: 'paid',
    acompte_paid_at: now,
    acompte_amount_eur: cumulativePaid,
    last_synced_stripe_at: now,
    last_activity_at: now,
  };

  if (ctx.paymentIntentId) updates.stripe_payment_intent_id = ctx.paymentIntentId;
  if (ctx.sessionId) updates.stripe_checkout_session_id = ctx.sessionId;

  console.log(
    '%s computed-status prospect=%s previous_paid=%d new_amount=%d cumul=%d ttc=%s -> status=%s',
    LOG_PREFIX,
    prospectId,
    previousPaid,
    ctx.amountEur,
    cumulativePaid,
    devisTotalTtc ?? 'null',
    computedStatus,
  );

  const { error: updErr } = await supabase.from('prospects').update(updates).eq('id', prospectId);
  if (updErr) {
    console.error(
      '%s update-prospect-failed prospect=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      updErr.message,
    );
    // On continue : Sellsy notify + email admin restent utiles meme si UPDATE fail.
  }

  // 2. Notifier Sellsy (best-effort, non bloquant). Quirk #24 : flow en
  //    2 etapes (POST /companies/{id}/payments puis POST /invoices/{id}/payments/{paymentId}).
  if (ctx.sellsyDocId) {
    await notifySellsyPaymentReceived({
      prospectId,
      documentId: Number(ctx.sellsyDocId),
      documentType: 'invoice',
      amountEur: ctx.amountEur,
      paymentMethod: 'stripe',
      reference: ctx.paymentIntentId ?? ctx.sessionId ?? undefined,
    });
  }

  // 3. Email admin notif paiement (route le template selon flow).
  await sendAdminEmail({
    prospectId,
    paymentType: type,
    amountEur: ctx.amountEur,
    success: true,
    paymentIntentId: ctx.paymentIntentId,
    sessionId: ctx.sessionId,
    flow: ctx.flow,
  });

  // 4. P5.x.4 Phase C : sync Brevo apres paiement Stripe (transition
  //    quoted -> acompte_paid ou paye_integral selon computedStatus).
  //    Best-effort : pas bloquant, log si fail.
  try {
    const { syncBrevoLifecycle } = await import('@/lib/brevo/sync-lifecycle');
    await syncBrevoLifecycle(prospectId);
  } catch (err) {
    console.warn(
      '%s brevo-sync-failed prospect=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 5. P5.x.7 : calcul auto de la commission affilie (idempotent —
  //    skip si deja calculee, ce qui evite double-compte sur paymentadd
  //    Sellsy back-to-back).
  const { maybeRecordAffiliateCommission } =
    await import('@/lib/affiliates/maybe-record-commission');
  await maybeRecordAffiliateCommission(prospectId);

  console.log(
    '%s mark-paid prospect=%s type=%s amount=%d',
    LOG_PREFIX,
    prospectId,
    type,
    ctx.amountEur,
  );
}

interface AdminEmailInput {
  prospectId: string;
  paymentType: 'acompte_30pct' | 'integral' | 'concierge';
  amountEur: number;
  success: boolean;
  paymentIntentId: string | null;
  sessionId: string | null;
  errorMessage?: string;
  /** P4.x.1 Bug B : route le template + la category Resend. */
  flow: 'acompte' | 'integral' | 'concierge';
}

async function sendAdminEmail(input: AdminEmailInput): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: prospect } = await supabase
      .from('prospects')
      .select('sellsy_devis_number, company:companies!inner(name), contact:contacts(email)')
      .eq('id', input.prospectId)
      .maybeSingle();

    const company = pickFirst(prospect?.company)?.name ?? '(société inconnue)';
    const contactEmail = pickFirst(prospect?.contact)?.email ?? '(email inconnu)';
    const documentNumber = prospect?.sellsy_devis_number ?? null;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const prospectUrl = `${baseUrl}/admin/prospects/${input.prospectId}`;
    const amountFmt = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(input.amountEur);

    const params = {
      prospectId: input.prospectId,
      prospectUrl,
      companyName: company,
      contactEmail,
      amountEur: amountFmt,
      documentNumber,
      paymentType: input.paymentType,
      stripeSessionId: input.sessionId ?? undefined,
      stripePaymentIntentId: input.paymentIntentId ?? undefined,
    };

    // P4.x.1 Bug B : route le template + category selon flow.
    // - flow=concierge -> renderAdminConciergePayeEmail / 'admin_concierge_paye'
    // - flow=acompte/integral -> renderAdminAcomptePayeEmail / 'admin_acompte_paye'
    let tpl: ReturnType<typeof renderAdminAcomptePayeEmail>;
    let category: 'admin_acompte_paye' | 'admin_concierge_paye' | 'admin_acompte_echec';
    if (!input.success) {
      tpl = renderAdminAcompteEchecEmail({ ...params, errorMessage: input.errorMessage });
      category = 'admin_acompte_echec';
    } else if (input.flow === 'concierge') {
      tpl = renderAdminConciergePayeEmail(params);
      category = 'admin_concierge_paye';
    } else {
      tpl = renderAdminAcomptePayeEmail(params);
      category = 'admin_acompte_paye';
    }

    // P4 M6 : centralise via sendAdminNotification (lecture
    // app_settings.admin_notification_emails + fallback + loop Resend).
    await sendAdminNotification(category, tpl);
  } catch (err) {
    console.error(
      '%s admin-email-failed prospect=%s msg=%s',
      LOG_PREFIX,
      input.prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
