/**
 * P6.x.5-nonies — désactive un Stripe Payment Link (active=false).
 *
 * Utilisé lors de la ré-émission d'un devis : l'ancien lien de paiement
 * (acompte_payment_link_id) doit être désactivé pour éviter que le client
 * ne paie un montant obsolète. Best-effort : si Stripe refuse (lien déjà
 * archivé, jamais créé, etc.), on log et continue.
 */

import { getStripe } from './client';

const LOG_PREFIX = '[stripe/cancel-payment-link]';

export interface CancelPaymentLinkResult {
  ok: boolean;
  message?: string;
}

export async function cancelStripePaymentLink(
  paymentLinkId: string,
): Promise<CancelPaymentLinkResult> {
  try {
    const stripe = getStripe();
    await stripe.paymentLinks.update(paymentLinkId, { active: false });
    console.log('%s deactivated link=%s', LOG_PREFIX, paymentLinkId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('%s deactivate-failed link=%s msg=%s', LOG_PREFIX, paymentLinkId, msg);
    return { ok: false, message: msg };
  }
}
