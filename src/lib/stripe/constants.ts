/**
 * Constantes Stripe partagees par les helpers de creation (checkout,
 * payment-link, etc.).
 *
 * P4.x.5 — `STRIPE_BUSINESS_TAG` est ajoute en `metadata.business` sur
 * tous les objets Stripe (Checkout Sessions, Payment Links, Payment
 * Intents derives) pour permettre le filtrage cote dashboard Stripe
 * partage entre plusieurs business de Phil (PodcastNews, audioexpert,
 * MDS Prospection).
 *
 * Single source of truth : si Phil change le nom du business ou ajoute
 * d'autres business a l'avenir, modifier ici uniquement.
 */
export const STRIPE_BUSINESS_TAG = 'mds-prospection';
