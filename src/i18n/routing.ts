import { defineRouting } from 'next-intl/routing';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Pathnames localisees (P3) — slugs distincts FR/EN sur les routes publiques.
 * Les routes admin restent sous /admin (non localisees).
 *
 * Ajouter une route :
 *   1. Ajouter la cle logique ici (utilisee par Link/redirect/usePathname)
 *   2. Creer le dossier physique sous src/app/[locale]/(public)/<slug-fr>/
 *      next-intl reecrit la variante EN vers le meme dossier physique.
 */
export const PATHNAMES = {
  '/': '/',
  '/styleguide': '/styleguide',
  '/inscription-partenaire': {
    fr: '/inscription-partenaire',
    en: '/partner-registration',
  },
  '/inscription-partenaire/check-email': {
    fr: '/inscription-partenaire/verifiez-votre-email',
    en: '/partner-registration/check-email',
  },
  '/inscription-partenaire/step2': {
    fr: '/inscription-partenaire/etape-2',
    en: '/partner-registration/step-2',
  },
  '/merci': {
    fr: '/merci',
    en: '/thank-you',
  },
  '/cgv': {
    fr: '/cgv',
    en: '/terms',
  },
  '/mentions-legales': {
    fr: '/mentions-legales',
    en: '/legal-notice',
  },
  '/politique-confidentialite': {
    fr: '/politique-confidentialite',
    en: '/privacy-policy',
  },
} as const;

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'fr',
  localePrefix: 'always',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
  pathnames: PATHNAMES,
});
