import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

/**
 * Endpoint de test Sentry — declenche une exception capturable.
 * Disponible uniquement en NODE_ENV=development pour eviter qu'un visiteur
 * en prod la trigger accidentellement.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'disabled in production' }, { status: 404 });
  }

  // 1. Capture explicite (verifie que le SDK est initialise)
  const eventId = Sentry.captureException(
    new Error('Sentry test event from /api/sentry-test — P0 M5 verification.'),
  );

  // 2. Force le flush avant que la requete se termine (sinon les events
  //    peuvent etre perdus en serverless / dev court).
  await Sentry.flush(5000);

  return NextResponse.json({
    status: 'sent',
    eventId,
    message: 'Sentry exception captured. Check https://sentry.io/issues/',
  });
}
