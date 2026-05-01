import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Replays : desactives en P0 (cout / privacy). A reactiver en P5 si besoin.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,

  // Performance browser
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  debug: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV ?? 'development',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
