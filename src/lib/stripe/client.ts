/**
 * Stripe SDK client singleton — lazy init pour le serveur uniquement.
 *
 * Usage :
 *   import { getStripe } from '@/lib/stripe/client';
 *   const stripe = getStripe();
 *   const session = await stripe.checkout.sessions.create({ ... });
 *
 * Environnement requis :
 *   - STRIPE_SECRET_KEY        (sk_test_... ou sk_live_...)
 *   - STRIPE_WEBHOOK_SECRET    (whsec_..., verifie cote /api/webhooks/stripe)
 *
 * Logs structures (prefix [stripe/client]).
 */

import Stripe from 'stripe';

let cachedClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (cachedClient) return cachedClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY must be set in env.');
  }

  cachedClient = new Stripe(secretKey, {
    // Lock l'API version pour eviter les surprises sur les changements
    // breaking de Stripe. A reviser au prochain upgrade SDK majeur.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: {
      name: 'mds-prospection',
      version: '0.5.0-p4',
    },
  });

  return cachedClient;
}

/** Util de tests : reset le cache singleton. */
export function _resetStripeClientForTests() {
  cachedClient = null;
}
