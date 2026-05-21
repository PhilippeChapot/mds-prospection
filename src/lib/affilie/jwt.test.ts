/**
 * @vitest-environment node
 *
 * P7.x.1.A — tests JWT helpers Espace Affilie.
 *
 * Mirror du test exposant : on verifie sign + verify happy path + erreur
 * codes + protection cross-type (un magic ne peut pas servir de session) +
 * protection cross-scope (un token exposant ne peut pas servir d'affilie).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';

const TEST_SECRET = 'a'.repeat(40);
const AFFILIATE_ID = 'aff_4242';

describe('Affilie JWT helpers (P7.x.1.A)', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
  });

  it('signAffilieMagicToken + verify happy path -> affiliateId restitue', async () => {
    const { signAffilieMagicToken, verifyAffilieMagicToken } = await import('./jwt');
    const token = await signAffilieMagicToken(AFFILIATE_ID);
    const claims = await verifyAffilieMagicToken(token);
    expect(claims.affiliateId).toBe(AFFILIATE_ID);
    expect(claims.type).toBe('magic');
    expect(claims.jti).toBeTruthy();
  });

  it('signAffilieSessionToken + verify happy path', async () => {
    const { signAffilieSessionToken, verifyAffilieSessionToken } = await import('./jwt');
    const token = await signAffilieSessionToken(AFFILIATE_ID);
    const claims = await verifyAffilieSessionToken(token);
    expect(claims.affiliateId).toBe(AFFILIATE_ID);
    expect(claims.type).toBe('session');
  });

  it("verify magic refuse un token type='session' (wrong-type)", async () => {
    const { signAffilieSessionToken, verifyAffilieMagicToken, AffilieTokenError } =
      await import('./jwt');
    const sessionToken = await signAffilieSessionToken(AFFILIATE_ID);
    await expect(verifyAffilieMagicToken(sessionToken)).rejects.toBeInstanceOf(AffilieTokenError);
    try {
      await verifyAffilieMagicToken(sessionToken);
    } catch (err) {
      expect((err as { code: string }).code).toBe('wrong-type');
    }
  });

  it('verify rejette un token signe avec scope!=affilie (anti cross-use exposant)', async () => {
    // Forge un token avec scope='exposant' qui sinon serait valide
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ type: 'session', scope: 'exposant' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(AFFILIATE_ID)
      .setJti('test-jti')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);
    const { verifyAffilieSessionToken, AffilieTokenError } = await import('./jwt');
    await expect(verifyAffilieSessionToken(token)).rejects.toBeInstanceOf(AffilieTokenError);
  });

  it('token tampered -> AffilieTokenError code=invalid', async () => {
    const { signAffilieSessionToken, verifyAffilieSessionToken, AffilieTokenError } =
      await import('./jwt');
    const token = await signAffilieSessionToken(AFFILIATE_ID);
    const tampered = token.slice(0, -2) + 'XX';
    await expect(verifyAffilieSessionToken(tampered)).rejects.toBeInstanceOf(AffilieTokenError);
  });

  it('no DOI_JWT_SECRET -> AffilieTokenError code=no-secret', async () => {
    process.env.DOI_JWT_SECRET = '';
    const { signAffilieSessionToken, AffilieTokenError } = await import('./jwt');
    await expect(signAffilieSessionToken(AFFILIATE_ID)).rejects.toBeInstanceOf(AffilieTokenError);
  });
});
