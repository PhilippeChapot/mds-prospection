/**
 * @vitest-environment node
 *
 * P14.x.CalendarExternalInvites — JWT RSVP (sign/verify).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signRsvpToken, verifyRsvpToken, RsvpTokenError } from './rsvp-jwt';

beforeEach(() => {
  vi.stubEnv('RSVP_JWT_SECRET', 'x'.repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rsvp-jwt (P14.x)', () => {
  it('sign + verify roundtrip', async () => {
    const token = await signRsvpToken({ eventId: 'evt-1', email: 'client@acme.fr' });
    const claims = await verifyRsvpToken(token);
    expect(claims.eventId).toBe('evt-1');
    expect(claims.email).toBe('client@acme.fr');
  });

  it('token invalide → RsvpTokenError', async () => {
    await expect(verifyRsvpToken('not-a-jwt')).rejects.toBeInstanceOf(RsvpTokenError);
  });

  it('secret manquant → RsvpTokenError no-secret', async () => {
    vi.stubEnv('RSVP_JWT_SECRET', '');
    await expect(signRsvpToken({ eventId: 'e', email: 'a@b.fr' })).rejects.toMatchObject({
      code: 'no-secret',
    });
  });
});
