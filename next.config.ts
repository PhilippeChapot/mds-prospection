import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // P11.x.Rebrand (2026-06-03) : Espace Exposant -> Espace Partenaire.
      // 308 permanent preserve la methode HTTP + query string (les magic
      // links existants /espace-exposant/login?token=xxx continuent a
      // fonctionner sans casser le token).
      {
        source: '/:locale/espace-exposant/:path*',
        destination: '/:locale/espace-partenaire/:path*',
        permanent: true,
      },
      {
        source: '/:locale/espace-exposant',
        destination: '/:locale/espace-partenaire',
        permanent: true,
      },
      // Fallback sans locale.
      {
        source: '/espace-exposant/:path*',
        destination: '/espace-partenaire/:path*',
        permanent: true,
      },
      {
        source: '/espace-exposant',
        destination: '/espace-partenaire',
        permanent: true,
      },
      // API routes (anciennement /api/espace-exposant/login, magic-link).
      {
        source: '/api/espace-exposant/:path*',
        destination: '/api/espace-partenaire/:path*',
        permanent: true,
      },
      // P11.x.Rebrand hotfix (2026-06-05) : le folder physique
      // inscription-exposant a ete renomme en inscription-partenaire pour
      // matcher la config next-intl. On garde les anciennes URLs valides
      // via 308 au cas ou Google/inbound liens externes pointent encore
      // dessus.
      {
        source: '/:locale/inscription-exposant/:path*',
        destination: '/:locale/inscription-partenaire/:path*',
        permanent: true,
      },
      {
        source: '/:locale/inscription-exposant',
        destination: '/:locale/inscription-partenaire',
        permanent: true,
      },
      {
        source: '/:locale/exhibitor-registration/:path*',
        destination: '/:locale/partner-registration/:path*',
        permanent: true,
      },
      {
        source: '/:locale/exhibitor-registration',
        destination: '/:locale/partner-registration',
        permanent: true,
      },
    ];
  },
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
