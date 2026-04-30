import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /* Sentry sera enveloppe par-dessus en M5 via withSentryConfig. */
};

export default withNextIntl(nextConfig);
