import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {};

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
