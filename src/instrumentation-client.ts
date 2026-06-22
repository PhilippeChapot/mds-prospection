import * as Sentry from '@sentry/nextjs';

const IGNORE_MESSAGES = [/^ResizeObserver loop/, /^Non-Error promise rejection captured$/];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Session Replay : 50 % des sessions en erreur, 1 % baseline.
  // RGPD : tout le texte, les inputs et les médias sont masqués.
  replaysOnErrorSampleRate: 0.5,
  replaysSessionSampleRate: 0.01,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // Performance browser
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  debug: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV ?? 'development',

  beforeSend(event, hint) {
    const exception = hint.originalException;
    if (exception instanceof Error) {
      const stack = exception.stack ?? '';
      const message = exception.message ?? '';

      // Drop : erreurs injectées par des extensions navigateur.
      if (
        stack.includes('chrome-extension://') ||
        stack.includes('moz-extension://') ||
        stack.includes('safari-web-extension://')
      )
        return null;

      // Drop : scripts anonymes sans trace de notre app.
      if (stack.includes('<anonymous>') && !stack.includes('/src/') && !stack.includes('.next/'))
        return null;

      // Drop : bruit connu navigateur.
      if (IGNORE_MESSAGES.some((p) => p.test(message))) return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
