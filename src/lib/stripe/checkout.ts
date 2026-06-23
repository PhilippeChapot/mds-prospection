/**
 * Helper Stripe Checkout Session pour le parcours acompte / integral.
 *
 * createCheckoutSession(prospectId, type) :
 *   - type='acompte_30pct' -> 30% du total HT du prospect
 *   - type='integral'      -> total TTC (HT * 1.20)
 *
 * Construit la session Stripe avec :
 *   - mode='payment' (pas de subscription)
 *   - 1 line item avec price_data inline (override du catalogue)
 *   - metadata { prospect_id, sellsy_document_id, type } pour reconstruction
 *     cote webhook
 *   - success_url + cancel_url localises selon contact.language
 *   - customer_email pre-rempli depuis contact.email
 *
 * Skip si prospect.is_test=true (assertSyncAllowed mode TEST).
 *
 * Persiste stripe_checkout_session_id sur le prospect avant retour.
 *
 * Logs structures (prefix [stripe/checkout]).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { assertSyncAllowed } from '@/lib/sync/skip-if-test';
import { getStripe } from './client';
import { STRIPE_BUSINESS_TAG } from './constants';

const LOG_PREFIX = '[stripe/checkout]';

export type CheckoutType = 'acompte_30pct' | 'integral';

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  amountCents: number;
}

/**
 * Calcule le montant a encaisser en CENTIMES (integer Stripe).
 * Exporte pour tests unitaires.
 */
export function computeCheckoutAmountCents(totalHtEur: number, type: CheckoutType): number {
  if (type === 'acompte_30pct') {
    return Math.round(totalHtEur * 0.3 * 100);
  }
  // integral : TTC = HT * 1.20 (TVA 20% standard FR)
  return Math.round(totalHtEur * 1.2 * 100);
}

/**
 * Construit le libelle de la ligne Stripe.
 * Ex: "Acompte 30% — devis D-20260505-02689"
 */
export function buildCheckoutLineName(type: CheckoutType, documentNumber: string | null): string {
  const docRef = documentNumber ?? 'devis MDS';
  if (type === 'acompte_30pct') {
    return `Acompte 30% — ${docRef}`;
  }
  return `Paiement intégral — ${docRef}`;
}

export async function createCheckoutSession(
  prospectId: string,
  type: CheckoutType,
): Promise<CheckoutSessionResult> {
  console.log('%s start prospect_id=%s type=%s', LOG_PREFIX, prospectId, type);

  const supabase = getSupabaseServiceClient();
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select(
      `
      id, is_test, estimated_amount, payment_path,
      sellsy_devis_id, sellsy_devis_number,
      stripe_checkout_session_id,
      contact:contacts!primary_contact_id(email, first_name, language)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (error || !prospect) {
    throw new Error(`prospect ${prospectId} introuvable`);
  }

  // Mode TEST : skip net (pas d'appel Stripe).
  assertSyncAllowed(prospect, 'stripe');

  if (!prospect.estimated_amount || prospect.estimated_amount <= 0) {
    throw new Error(
      `prospect ${prospectId} sans estimated_amount — impossible de calculer le montant Stripe.`,
    );
  }

  const contact = pickFirst(prospect.contact);
  if (!contact?.email) {
    throw new Error(
      `prospect ${prospectId} sans contact.email — Stripe Checkout requiert un email.`,
    );
  }

  const locale: 'fr' | 'en' = contact.language === 'EN' ? 'en' : 'fr';
  const amountCents = computeCheckoutAmountCents(Number(prospect.estimated_amount), type);
  const lineName = buildCheckoutLineName(type, prospect.sellsy_devis_number ?? null);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/${locale}/merci?stripe_session={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/${locale}/inscription-partenaire/etape-2?cancelled=stripe`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    locale,
    customer_email: contact.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'eur',
          product_data: { name: lineName },
          unit_amount: amountCents,
        },
      },
    ],
    metadata: {
      prospect_id: prospectId,
      sellsy_document_id: prospect.sellsy_devis_id ?? '',
      type,
      // P4.x.1 Bug B : flow distinct pour route le bon template admin
      // au webhook. acompte_30pct/integral -> admin_acompte_paye,
      // concierge (Payment Link) -> admin_concierge_paye.
      flow: type === 'integral' ? 'integral' : 'acompte',
      // P4.x.5 : tag pour filtrer MDS dans le compte Stripe partage.
      business: STRIPE_BUSINESS_TAG,
    },
    payment_intent_data: {
      metadata: {
        prospect_id: prospectId,
        sellsy_document_id: prospect.sellsy_devis_id ?? '',
        type,
        flow: type === 'integral' ? 'integral' : 'acompte',
        business: STRIPE_BUSINESS_TAG,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error(
      `Stripe checkout.sessions.create n'a pas retourne d'URL pour prospect ${prospectId}`,
    );
  }

  // Persist session_id pour le rapprochement webhook -> prospect.
  await supabase
    .from('prospects')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', prospectId);

  console.log(
    '%s success prospect_id=%s session_id=%s amount_cents=%d type=%s locale=%s',
    LOG_PREFIX,
    prospectId,
    session.id,
    amountCents,
    type,
    locale,
  );

  return { sessionId: session.id, url: session.url, amountCents };
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
