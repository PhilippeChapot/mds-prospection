import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';

/**
 * Espaces authentifies (login forms + dashboards) — pas de contenu
 * marketing, exclus du crawl. Le prefixe locale next-intl (localePrefix
 * 'always') impose le wildcard.
 */
const AUTHENTICATED_AREAS = ['/*/espace-partenaire', '/*/espace-visiteur', '/*/affilie'] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/auth/', ...AUTHENTICATED_AREAS],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
