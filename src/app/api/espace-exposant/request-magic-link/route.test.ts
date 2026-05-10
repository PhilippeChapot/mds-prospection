/**
 * @vitest-environment node
 *
 * P5.x.2 — tests POST /api/espace-exposant/request-magic-link.
 *
 * Cas couverts :
 *   - email match prospect actif -> envoi Resend + 200 success
 *   - email sans match -> 200 success (anti-enum, pas de Resend)
 *   - email match prospect status=lost -> 200 success (pas d'envoi)
 *   - payload invalide -> 400
 *   - rate-limit IP atteint -> 429
 *   - rate-limit email atteint -> 429
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_SECRET = 'a'.repeat(40);

describe('POST /api/espace-exposant/request-magic-link (P5.x.2)', () => {
  let originalSecret: string | undefined;
  let originalAppUrl: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.DOI_JWT_SECRET;
    process.env.DOI_JWT_SECRET = TEST_SECRET;
    originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.mediadays.solutions';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.DOI_JWT_SECRET = originalSecret;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockSupabaseWithProspect(args: {
    firstName: string;
    prospectId: string;
    status: string;
  }) {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            ilike: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'c1',
                      first_name: args.firstName,
                      prospects: [{ id: args.prospectId, status: args.status }],
                    },
                  ],
                }),
            }),
          }),
        }),
      }),
    }));
  }

  function mockSupabaseEmpty() {
    vi.doMock('@/lib/supabase/service', () => ({
      getSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            ilike: () => ({
              limit: () => Promise.resolve({ data: [] }),
            }),
          }),
        }),
      }),
    }));
  }

  function setupMocks() {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true, remaining: 99, retryAfterSeconds: 0 }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
  }

  it('email match prospect actif -> envoi Resend + 200 success', async () => {
    setupMocks();
    mockSupabaseWithProspect({ firstName: 'Marie', prospectId: 'pid-1', status: 'devis_envoye' });
    const sendMock = vi.fn().mockResolvedValue({ id: 'resend-id' });
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: sendMock,
    }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'marie@radio.fr', locale: 'fr' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendMock).toHaveBeenCalledOnce();
    const sendArgs = sendMock.mock.calls[0][0];
    expect(sendArgs.to).toBe('marie@radio.fr');
    expect(sendArgs.subject).toContain('Espace Exposant');
    // P5.x.2.bis : URL pointe maintenant vers le Route Handler /api/...
    // (le `&` est echappe en `&amp;` dans le HTML).
    expect(sendArgs.html).toContain('test.mediadays.solutions/api/espace-exposant/login?token=');
    expect(sendArgs.html).toContain('locale=fr');
    expect(sendArgs.text).toContain('test.mediadays.solutions/api/espace-exposant/login?token=');
  });

  it('email sans match -> 200 success generique sans envoi Resend', async () => {
    setupMocks();
    mockSupabaseEmpty();
    const sendMock = vi.fn();
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: sendMock,
    }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@nowhere.test', locale: 'fr' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('prospect status=lost -> 200 success sans envoi (filtre actifs)', async () => {
    setupMocks();
    mockSupabaseWithProspect({ firstName: 'Old', prospectId: 'pid-x', status: 'lost' });
    const sendMock = vi.fn();
    vi.doMock('@/lib/resend/client', () => ({
      sendTransactionalEmailViaResend: sendMock,
    }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'old@test.fr' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('payload invalide (email malforme) -> 400 invalid_payload', async () => {
    setupMocks();
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'invalid_payload' });
  });

  it('rate-limit IP atteint -> 429', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: false, remaining: 0, retryAfterSeconds: 60 }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@y.fr' }),
      }),
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
  });

  it('rate-limit par email atteint apres IP OK -> 429', async () => {
    let callCount = 0;
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => {
        callCount += 1;
        // 1er appel = IP, 2eme = email. On laisse passer IP, on bloque email.
        return callCount === 1
          ? { ok: true, remaining: 5, retryAfterSeconds: 0 }
          : { ok: false, remaining: 0, retryAfterSeconds: 30 };
      },
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'spam@target.fr' }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
