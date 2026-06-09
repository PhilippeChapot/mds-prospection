/**
 * @vitest-environment node
 *
 * P14.2.SalesCalendarGoogleSync — tests du state CSRF OAuth (HMAC + TTL).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signOAuthState, verifyOAuthState } from './oauth-client';

const ORIGINAL_KEY = process.env.CALENDAR_OAUTH_ENCRYPTION_KEY;
const USER = 'aa000000-0000-0000-0000-000000000001';

describe('OAuth state sign/verify (P14.2)', () => {
  beforeEach(() => {
    process.env.CALENDAR_OAUTH_ENCRYPTION_KEY = 'state-secret-for-tests-1234567890';
  });
  afterEach(() => {
    process.env.CALENDAR_OAUTH_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it('roundtrip : state signé est vérifié et rend le userId', () => {
    const now = 1_750_000_000_000;
    const state = signOAuthState(USER, now);
    const r = verifyOAuthState(state, now + 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe(USER);
  });

  it('rejette un HMAC altéré', () => {
    const now = 1_750_000_000_000;
    const state = signOAuthState(USER, now);
    const tampered = `${state.slice(0, -1)}${state.endsWith('0') ? '1' : '0'}`;
    expect(verifyOAuthState(tampered, now).ok).toBe(false);
  });

  it('rejette un state expiré (> 15 min)', () => {
    const now = 1_750_000_000_000;
    const state = signOAuthState(USER, now);
    const r = verifyOAuthState(state, now + 16 * 60 * 1000);
    expect(r.ok).toBe(false);
  });

  it('rejette un format invalide', () => {
    expect(verifyOAuthState('only.two', Date.now()).ok).toBe(false);
    expect(verifyOAuthState('a.b.c.d', Date.now()).ok).toBe(false);
  });
});
