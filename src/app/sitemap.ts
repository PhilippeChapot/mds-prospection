import type { MetadataRoute } from 'next';
import { PATHNAMES } from '@/i18n/routing';

/**
 * Sitemap public — uniquement les pages marketing/legales indexables.
 * Les espaces authentifies (espace-partenaire, espace-visiteur, affilie,
 * kpi, pre-programme) sont volontairement absents (cf. src/app/robots.ts).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';

type PathnameKey = keyof typeof PATHNAMES;

const PUBLIC_PAGES: Array<{
  key: PathnameKey;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { key: '/', changeFrequency: 'weekly', priority: 1.0 },
  { key: '/inscription-partenaire', changeFrequency: 'monthly', priority: 0.8 },
  { key: '/mentions-legales', changeFrequency: 'yearly', priority: 0.3 },
  { key: '/cgv', changeFrequency: 'yearly', priority: 0.3 },
  { key: '/politique-confidentialite', changeFrequency: 'yearly', priority: 0.3 },
];

function localizedPath(key: PathnameKey, locale: 'fr' | 'en'): string {
  const entry = PATHNAMES[key];
  const path = typeof entry === 'string' ? entry : entry[locale];
  return path === '/' ? '' : path;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PAGES.flatMap(({ key, changeFrequency, priority }) => {
    const frUrl = `${APP_URL}/fr${localizedPath(key, 'fr')}`;
    const enUrl = `${APP_URL}/en${localizedPath(key, 'en')}`;

    return [
      {
        url: frUrl,
        lastModified,
        changeFrequency,
        priority,
        alternates: { languages: { 'en-US': enUrl } },
      },
      {
        url: enUrl,
        lastModified,
        changeFrequency,
        priority,
        alternates: { languages: { 'fr-FR': frUrl } },
      },
    ];
  });
}
