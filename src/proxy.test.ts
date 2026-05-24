/**
 * @vitest-environment node
 *
 * P7.x.1.F-bis — tests proxy auto-pose du cookie tracking affilie
 * (mds_affiliate_ref) sur `?ref=<token>`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock next-intl middleware + supabase middleware pour isoler la logique
// du cookie. Pas d'auth Supabase ni de routing i18n reel.
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    localePrefix: 'always',
  },
}));
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async () => ({
    supabaseResponse: NextResponse.next(),
    user: null,
  }),
}));

describe('proxy — affiliate tracking cookie (P7.x.1.F-bis)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('?ref=TEST_REF sur /fr/ -> pose cookie mds_affiliate_ref + maxAge 90j', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(new URL('https://mediadays.solutions/fr/?ref=TEST_REF'));
    const res = await proxy(req);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/mds_affiliate_ref=TEST_REF/);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    // 90j = 7776000 secondes
    expect(setCookie).toMatch(/Max-Age=7776000/i);
    // Pas HttpOnly (doctrine P5.x.7 : lisible JS pour le wizard SPA)
    expect(setCookie).not.toMatch(/HttpOnly/i);
  });

  it('?ref=TEST_REF sur /en/ -> meme cookie pose (matcher [locale] OK)', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(new URL('https://mediadays.solutions/en/?ref=TEST_REF'));
    const res = await proxy(req);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/mds_affiliate_ref=TEST_REF/);
  });

  it('?ref=TEST_REF sur la racine / -> cookie pose aussi', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(new URL('https://mediadays.solutions/?ref=TEST_REF'));
    const res = await proxy(req);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/mds_affiliate_ref=TEST_REF/);
  });

  it('pas de cookie quand pas de query ?ref=', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(new URL('https://mediadays.solutions/fr/'));
    const res = await proxy(req);
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/mds_affiliate_ref/);
  });

  it('ref invalide (caracteres exotiques) -> pas de cookie + log warning', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(
      new URL('https://mediadays.solutions/fr/?ref=<script>alert(1)</script>'),
    );
    const res = await proxy(req);
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/mds_affiliate_ref/);
  });

  it('?ref= sur /admin/* -> cookie pose meme sur la redirect /admin/login', async () => {
    const proxy = (await import('./proxy')).default;
    const req = new NextRequest(
      new URL('https://mediadays.solutions/admin/prospects?ref=TEST_REF'),
    );
    const res = await proxy(req);
    // 307 redirect vers /admin/login mais cookie present sur la response
    expect(res.headers.get('set-cookie') ?? '').toMatch(/mds_affiliate_ref=TEST_REF/);
  });

  it('ref tres long (> 64 chars) -> rejete (regex isValidAffiliateToken)', async () => {
    const proxy = (await import('./proxy')).default;
    const longRef = 'A'.repeat(65);
    const req = new NextRequest(new URL(`https://mediadays.solutions/fr/?ref=${longRef}`));
    const res = await proxy(req);
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/mds_affiliate_ref/);
  });
});
