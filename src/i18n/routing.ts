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
  '/inscription-exposant': {
    fr: '/inscription-exposant',
    en: '/exhibitor-registration',
  },
  '/inscription-exposant/check-email': {
    fr: '/inscription-exposant/verifiez-votre-email',
    en: '/exhibitor-registration/check-email',
  },
  '/inscription-exposant/step2': {
    fr: '/inscription-exposant/etape-2',
    en: '/exhibitor-registration/step-2',
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
