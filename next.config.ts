import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // P5.x.13 — Fix bug 500 pages legales : Turbopack faisait require()
  // sur @exodus/bytes (ESM-only) via la chaine de deps :
  //   isomorphic-dompurify -> jsdom -> html-encoding-sniffer -> @exodus/bytes
  // Crash en SSR sur toute route incluant isomorphic-dompurify (les pages
  // legales /fr/cgv, /mentions-legales, /politique-confidentialite) avec
  // ERR_REQUIRE_ESM. serverExternalPackages dit a Next d'externaliser ces
  // libs vers le runtime Node natif (qui supporte ESM) au lieu du bundler.
  serverExternalPackages: [
    'isomorphic-dompurify',
    'jsdom',
    'html-encoding-sniffer',
    '@exodus/bytes',
  ],
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Skip Sentry plugin pendant les builds locaux qui n'ont pas le token (CI factice).
  silent: !process.env.CI,

  // Upload des sourcemaps cote prod uniquement.
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
  disableLogger: true,
});
