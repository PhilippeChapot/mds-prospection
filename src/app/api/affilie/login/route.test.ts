/**
 * @vitest-environment node
 *
 * P7.x.1.A — tests GET /api/affilie/login.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'a'.repeat(40);
const AFFILIATE_ID = 'aff-test-123';

describe('GET /api/affilie/login (P7.x.1.A)', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Mock service-role pour ne pas tenter une vraie UPDATE.
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    }));
  });

  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('token magic valide -> 307 redirect /affilie/dashboard + cookie affilie_session', async () => {
    const { signAffilieMagicToken } = await import('@/lib/affilie/jwt');
    const token = await signAffilieMagicToken(AFFILIATE_ID);
    const { GET } = await import('./route');
    const req = new NextRequest(new URL(`http://localhost/api/affilie/login?token=${token}`));
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/affilie\/dashboard$/);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/affilie_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('token absent -> redirect /affilie?error=invalid', async () => {
    const { GET } = await import('./route');
    const req = new NextRequest(new URL('http://localhost/api/affilie/login'));
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/affilie\?error=invalid$/);
  });

  it('token tampered -> redirect /affilie?error=invalid', async () => {
    const { signAffilieMagicToken } = await import('@/lib/affilie/jwt');
    const token = await signAffilieMagicToken(AFFILIATE_ID);
    const tampered = token.slice(0, -2) + 'XX';
    const { GET } = await import('./route');
    const req = new NextRequest(new URL(`http://localhost/api/affilie/login?token=${tampered}`));
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/affilie\?error=invalid$/);
  });

  it('un token session ne peut pas servir de magic (wrong-type)', async () => {
    const { signAffilieSessionToken } = await import('@/lib/affilie/jwt');
    const sessionToken = await signAffilieSessionToken(AFFILIATE_ID);
    const { GET } = await import('./route');
    const req = new NextRequest(
      new URL(`http://localhost/api/affilie/login?token=${sessionToken}`),
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/affilie\?error=invalid$/);
  });
});
