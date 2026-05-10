/**
 * @vitest-environment node
 *
 * P5.x.2 — tests JWT helpers Espace Exposant.
 *
 * Couvre :
 *   - sign + verify roundtrip (magic + session)
 *   - type swap rejected (magic verifie comme session -> wrong-type)
 *   - token expire -> 'expired'
 *   - token tampered -> 'invalid'
 *   - secret manquant -> 'no-secret'
 *   - TTL : magic=15min, session=8h
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TEST_SECRET = 'a'.repeat(40);

describe('Espace Exposant JWT (P5.x.2)', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
    vi.useRealTimers();
  });

  it('signMagicToken + verifyMagicToken roundtrip', async () => {
    const { signMagicToken, verifyMagicToken } = await import('./jwt');
    const token = await signMagicToken('prospect-123');
    const claims = await verifyMagicToken(token);
    expect(claims.prospectId).toBe('prospect-123');
    expect(claims.type).toBe('magic');
    expect(claims.jti).toBeTruthy();
  });

  it('signSessionToken + verifySessionToken roundtrip', async () => {
    const { signSessionToken, verifySessionToken } = await import('./jwt');
    const token = await signSessionToken('prospect-456');
    const claims = await verifySessionToken(token);
    expect(claims.prospectId).toBe('prospect-456');
    expect(claims.type).toBe('session');
  });

  it('verifyMagicToken refuse un token type=session (wrong-type)', async () => {
    const { signSessionToken, verifyMagicToken, EspaceExposantTokenError } = await import('./jwt');
    const sessionToken = await signSessionToken('prospect-1');
    await expect(verifyMagicToken(sessionToken)).rejects.toMatchObject({
      name: 'EspaceExposantTokenError',
      code: 'wrong-type',
    });
    void EspaceExposantTokenError;
  });

  it('verifySessionToken refuse un token type=magic (wrong-type)', async () => {
    const { signMagicToken, verifySessionToken } = await import('./jwt');
    const magicToken = await signMagicToken('prospect-1');
    await expect(verifySessionToken(magicToken)).rejects.toMatchObject({
      code: 'wrong-type',
    });
  });

  it('token tampered -> code=invalid', async () => {
    const { signMagicToken, verifyMagicToken } = await import('./jwt');
    const token = await signMagicToken('prospect-1');
    const tampered = token.slice(0, -2) + 'XX';
    await expect(verifyMagicToken(tampered)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('secret manquant -> code=no-secret', async () => {
    process.env.DOI_JWT_SECRET = '';
    vi.resetModules();
    const { signMagicToken } = await import('./jwt');
    await expect(signMagicToken('p1')).rejects.toMatchObject({ code: 'no-secret' });
  });

  it('secret trop court (<32 chars) -> code=no-secret', async () => {
    process.env.DOI_JWT_SECRET = 'tooshort';
    vi.resetModules();
    const { signMagicToken } = await import('./jwt');
    await expect(signMagicToken('p1')).rejects.toMatchObject({ code: 'no-secret' });
  });

  it('magic token contient bien exp = iat + 15 min', async () => {
    const { signMagicToken } = await import('./jwt');
    const token = await signMagicToken('p1');
    const [, body] = token.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(payload.type).toBe('magic');
  });

  it('session token contient bien exp = iat + 8h', async () => {
    const { signSessionToken } = await import('./jwt');
    const token = await signSessionToken('p1');
    const [, body] = token.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
    expect(payload.type).toBe('session');
  });

  it('un token expire (exp dans le passe) -> code=expired', async () => {
    // Forge un token avec exp = il y a 1h en signant via la lib directement.
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(TEST_SECRET);
    const expiredToken = await new SignJWT({ type: 'magic' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('p1')
      .setJti(crypto.randomUUID())
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3500)
      .sign(secret);
    const { verifyMagicToken } = await import('./jwt');
    await expect(verifyMagicToken(expiredToken)).rejects.toMatchObject({ code: 'expired' });
  });
});
