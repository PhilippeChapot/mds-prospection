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
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import type { Database } from '@/lib/supabase/database.types';
import {
  renderAdminAcomptePayeEmail,
  renderAdminAcompteEchecEmail,
} from '@/lib/resend/templates/admin-payment';

type ProspectUpdate = Database['public']['Tables']['prospects']['Update'];

const LOG_PREFIX = '[stripe/webhook]';

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  console.log('%s dispatch type=%s id=%s', LOG_PREFIX, event.type, event.id);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
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
  const type =
    (session.metadata?.type as 'acompte_30pct' | 'integral' | 'concierge' | undefined) ??
    'acompte_30pct';

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
  });
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  const prospectId = intent.metadata?.prospect_id;
  const sellsyDocId = intent.metadata?.sellsy_document_id || null;
  const type =
    (intent.metadata?.type as 'acompte_30pct' | 'integral' | 'concierge' | undefined) ??
    'concierge';

  if (!prospectId) {
    // Note : ce branche se declenche aussi sur les payment_intent
    // crees par checkout.session — on a deja traite via session.completed.
    // Sans prospect_id sur les metadata du PI on est dans un cas Payment
    // Link pur (concierge), avec metadata redondant via paymentLinks.create.
    console.log('%s pi-succeeded-no-prospect-id pi=%s — ignore', LOG_PREFIX, intent.id);
    return;
  }

  const amountEur = (intent.amount_received ?? intent.amount ?? 0) / 100;
  await markProspectPaid(prospectId, type, {
    sellsyDocId,
    amountEur,
    paymentIntentId: intent.id,
    sessionId: null,
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
  });
}

interface MarkPaidContext {
  sellsyDocId: string | null;
  amountEur: number;
  paymentIntentId: string | null;
  sessionId: string | null;
}

async function markProspectPaid(
  prospectId: string,
  type: 'acompte_30pct' | 'integral' | 'concierge',
  ctx: MarkPaidContext,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // 1. UPDATE prospect : status + acompte_paid_at + colonnes Stripe + sync indicator.
  const now = new Date().toISOString();
  const updates: ProspectUpdate = {
    status: type === 'integral' ? 'signe' : 'acompte_paye',
    acompte_status: 'paid',
    acompte_paid_at: now,
    acompte_amount_eur: ctx.amountEur,
    last_synced_stripe_at: now,
    last_activity_at: now,
  };

  if (ctx.paymentIntentId) updates.stripe_payment_intent_id = ctx.paymentIntentId;
  if (ctx.sessionId) updates.stripe_checkout_session_id = ctx.sessionId;

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

  // 2. Notifier Sellsy (best-effort, non bloquant).
  if (ctx.sellsyDocId) {
    await notifySellsyPaymentReceived({
      documentId: Number(ctx.sellsyDocId),
      documentType: 'invoice',
      amountEur: ctx.amountEur,
      paymentMethod: 'stripe',
      reference: ctx.paymentIntentId ?? ctx.sessionId ?? undefined,
    });
  }

  // 3. Email admin notif paiement.
  await sendAdminEmail({
    prospectId,
    paymentType: type,
    amountEur: ctx.amountEur,
    success: true,
    paymentIntentId: ctx.paymentIntentId,
    sessionId: ctx.sessionId,
  });

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

    const tpl = input.success
      ? renderAdminAcomptePayeEmail(params)
      : renderAdminAcompteEchecEmail({ ...params, errorMessage: input.errorMessage });

    // Recipients : app_settings.admin_notification_emails (P4 M1).
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_notification_emails')
      .maybeSingle();
    const recipients = (setting?.value as string[] | null) ?? ['philippe.chapot@gmail.com'];
    if (recipients.length === 0) {
      console.warn('%s admin-emails-empty', LOG_PREFIX);
      return;
    }

    for (const to of recipients) {
      await sendTransactionalEmailViaResend({
        to,
        toName: 'Admin MDS',
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: 'category', value: input.success ? 'admin_acompte_paye' : 'admin_acompte_echec' },
        ],
      });
    }
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
