/**
 * @vitest-environment node
 *
 * P7.x.1.A — tests POST /api/affilie/request-magic-link.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_SECRET = 'a'.repeat(40);

describe('POST /api/affilie/request-magic-link (P7.x.1.A)', () => {
  let originalSecret: string | undefined;
  let resendMock: ReturnType<typeof vi.fn>;
  let supabaseLimit: ReturnType<typeof vi.fn>;
  let supabaseIlike: ReturnType<typeof vi.fn>;
  let foundAffiliate: { id: string; display_name: string; is_active: boolean } | null;

  function mockEnv() {
    resendMock = vi.fn().mockResolvedValue({ id: 'res-1' });
    foundAffiliate = null;

    // chain: from('affiliates').select(...).ilike('contact_email', email).limit(1)
    supabaseLimit = vi.fn(() => Promise.resolve({ data: foundAffiliate ? [foundAffiliate] : [] }));
    supabaseIlike = vi.fn(() => ({ limit: supabaseLimit }));
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({ ilike: supabaseIlike }),
        }),
      }),
    }));

    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: resendMock,
    }));
  }

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('email match affilie actif -> envoi Resend + 200 success + magic-link FR par defaut', async () => {
    mockEnv();
    foundAffiliate = { id: 'aff-1', display_name: 'Test Media', is_active: true };
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/affilie/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'lucas+match@radiohouse.pro' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(resendMock).toHaveBeenCalledTimes(1);
    const call = resendMock.mock.calls[0][0];
    expect(call.subject).toMatch(/Espace Affilié/);
    expect(call.html).toMatch(/api\/affilie\/login\?token=/);
    // P7.x.1.A-bis : le magic-link porte la locale (defaut fr). HTML escape
    // `&` -> `&amp;` dans le href, on cherche dans le payload .text non
    // echape pour matcher plus simplement.
    expect(call.text).toMatch(/&locale=fr/);
    // requestPageUrl inclut le prefix /fr/
    expect(call.html).toMatch(/\/fr\/affilie/);
  });

  it('P7.x.1.A-bis — locale=en propage dans le magic-link', async () => {
    mockEnv();
    foundAffiliate = { id: 'aff-2', display_name: 'EN Partner', is_active: true };
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/affilie/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'en+partner@example.com', locale: 'en' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(resendMock).toHaveBeenCalledTimes(1);
    const call = resendMock.mock.calls[0][0];
    expect(call.text).toMatch(/&locale=en/);
    expect(call.html).toMatch(/\/en\/affilie/);
  });

  it('email sans match -> 200 success generique (anti-enum) + pas d’envoi Resend', async () => {
    mockEnv();
    foundAffiliate = null;
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/affilie/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ghost+nope@nowhere.tld' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(resendMock).not.toHaveBeenCalled();
  });

  it('affilie archive (is_active=false) -> pas d’envoi Resend (genere success quand meme)', async () => {
    mockEnv();
    foundAffiliate = { id: 'aff-1', display_name: 'Archived Media', is_active: false };
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/affilie/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'archived@radiohouse.pro' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(resendMock).not.toHaveBeenCalled();
  });

  it('payload invalide -> 400 invalid_payload', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/affilie/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'pas-un-email' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
  });
});
