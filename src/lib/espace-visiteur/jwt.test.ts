/**
 * @vitest-environment node
 *
 * P15.3 — tests JWT visiteur (sign/verify roundtrip + protections).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  signVisitorMagicToken,
  signVisitorSessionToken,
  verifyVisitorMagicToken,
  verifyVisitorSessionToken,
  EspaceVisiteurTokenError,
} from './jwt';

beforeAll(() => {
  process.env.VISITOR_JWT_SECRET = 'test-visitor-secret-0123456789abcdef-xyz';
});

describe('visitor JWT (P15.3)', () => {
  it('magic token roundtrip → visitorId + type magic', async () => {
    const token = await signVisitorMagicToken('vis-1');
    const claims = await verifyVisitorMagicToken(token);
    expect(claims.visitorId).toBe('vis-1');
    expect(claims.type).toBe('magic');
  });

  it('session token roundtrip → visitorId + type session', async () => {
    const token = await signVisitorSessionToken('vis-2');
    const claims = await verifyVisitorSessionToken(token);
    expect(claims.visitorId).toBe('vis-2');
    expect(claims.type).toBe('session');
  });

  it('un magic token est refusé comme session (wrong-type)', async () => {
    const magic = await signVisitorMagicToken('vis-3');
    await expect(verifyVisitorSessionToken(magic)).rejects.toMatchObject({ code: 'wrong-type' });
  });

  it('un token corrompu est rejeté (invalid)', async () => {
    await expect(verifyVisitorMagicToken('not-a-jwt')).rejects.toBeInstanceOf(
      EspaceVisiteurTokenError,
    );
  });
});
