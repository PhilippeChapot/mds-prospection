import { defineRouting } from 'next-intl/routing';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: 'fr',
  localePrefix: 'always',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});
