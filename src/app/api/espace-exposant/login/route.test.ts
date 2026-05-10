/**
 * @vitest-environment node
 *
 * P5.x.2.bis — tests GET /api/espace-exposant/login.
 *
 * Cas couverts :
 *   - token magic valide -> 307 redirect /[locale]/dashboard + cookie pose
 *   - token absent       -> 307 redirect ?error=invalid
 *   - token expire       -> 307 redirect ?error=expired
 *   - token tampered     -> 307 redirect ?error=invalid
 *   - locale=en          -> redirect avec /en/...
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'a'.repeat(40);

describe('GET /api/espace-exposant/login (P5.x.2.bis)', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
  });

  it('token magic valide -> 307 redirect /fr/dashboard + cookie session', async () => {
    const { signMagicToken } = await import('@/lib/espace-exposant/jwt');
    const token = await signMagicToken('prospect-123');

    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/espace-exposant/login?token=${token}&locale=fr`),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/fr/espace-exposant/dashboard');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('espace_exposant_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Path=/');
  });

  it('locale=en -> redirect /en/dashboard', async () => {
    const { signMagicToken } = await import('@/lib/espace-exposant/jwt');
    const token = await signMagicToken('prospect-456');

    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/espace-exposant/login?token=${token}&locale=en`),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/en/espace-exposant/dashboard');
  });

  it('token absent -> redirect ?error=invalid', async () => {
    const { GET } = await import('./route');
    const req = new NextRequest(new URL('http://localhost/api/espace-exposant/login'));
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/fr\/espace-exposant\?error=invalid/);
  });

  it('token expire -> redirect ?error=expired', async () => {
    // Forge un magic token avec exp dans le passe.
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(TEST_SECRET);
    const expiredToken = await new SignJWT({ type: 'magic' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('prospect-1')
      .setJti(crypto.randomUUID())
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3500)
      .sign(secret);

    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/espace-exposant/login?token=${expiredToken}&locale=fr`),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/fr\/espace-exposant\?error=expired/);
  });

  it('token tampered -> redirect ?error=invalid', async () => {
    const { signMagicToken } = await import('@/lib/espace-exposant/jwt');
    const goodToken = await signMagicToken('p1');
    const tampered = goodToken.slice(0, -2) + 'XX';

    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/espace-exposant/login?token=${tampered}`),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\?error=invalid/);
  });

  it('token type=session refuse comme magic -> redirect ?error=invalid (wrong-type)', async () => {
    const { signSessionToken } = await import('@/lib/espace-exposant/jwt');
    const sessionToken = await signSessionToken('p1');

    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/espace-exposant/login?token=${sessionToken}`),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\?error=invalid/);
  });
});
