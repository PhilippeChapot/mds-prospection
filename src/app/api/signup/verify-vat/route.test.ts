/**
 * P5.x.1 — tests POST /api/signup/verify-vat.
 *
 * On mocke `verifyVatNumber` du helper VIES + le rate limiter pour
 * isoler la logique HTTP de la route. Cas couverts :
 *   - country FR ou non-UE -> 200 { ok:false, error:'invalid_country' }
 *   - VIES valide          -> 200 { ok:true, name?, address? }
 *   - VIES invalide        -> 200 { ok:false, error:'not_valid' }
 *   - VIES throw           -> 200 { ok:false, error:'vies_unavailable' }
 *   - Payload invalide     -> 400 { ok:false, error:'invalid_payload' }
 *   - Rate limited         -> 429
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('POST /api/signup/verify-vat (P5.x.1)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('FR rejected as invalid_country (autoliquidation FR impossible)', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return { ...actual, verifyVatNumber: vi.fn() };
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'FR', vatNumber: '12345678901' }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'invalid_country' });
  });

  it('non-EU (US) rejected as invalid_country', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return { ...actual, verifyVatNumber: vi.fn() };
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'US', vatNumber: '12345' }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('invalid_country');
  });

  it('DE valid -> ok:true avec name', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return {
        ...actual,
        verifyVatNumber: vi.fn().mockResolvedValue({
          isValid: true,
          name: 'Bauer Media GmbH',
          address: 'Hamburg',
          fromCache: false,
        }),
      };
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'DE', vatNumber: '123456789' }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      name: 'Bauer Media GmbH',
      address: 'Hamburg',
      fromCache: false,
    });
  });

  it('DE invalide -> ok:false error=not_valid', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return {
        ...actual,
        verifyVatNumber: vi.fn().mockResolvedValue({
          isValid: false,
          fromCache: false,
        }),
      };
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'DE', vatNumber: '999999999' }),
      }),
    );
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'not_valid' });
  });

  it('VIES throw -> ok:false error=vies_unavailable', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return {
        ...actual,
        verifyVatNumber: vi.fn().mockRejectedValue(new Error('boom')),
      };
    });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'IT', vatNumber: '12345678901' }),
      }),
    );
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'vies_unavailable' });
  });

  it('payload invalide -> 400 invalid_payload', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'DE' }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'invalid_payload' });
  });

  it('rate limited -> 429', async () => {
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: false, retryAfterSeconds: 60 }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'DE', vatNumber: '123456789' }),
      }),
    );
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
  });

  it('country prefix dans vatNumber est strippe avant verify', async () => {
    const verifyVatNumberMock = vi.fn().mockResolvedValue({
      isValid: true,
      fromCache: true,
    });
    vi.doMock('@/lib/rate-limit/in-memory', () => ({
      checkRateLimit: () => ({ ok: true }),
    }));
    vi.doMock('@/lib/rate-limit/ip', () => ({ getClientIp: () => '1.2.3.4' }));
    vi.doMock('@/lib/vies/verify', async () => {
      const actual = await vi.importActual<typeof import('@/lib/vies/verify')>('@/lib/vies/verify');
      return { ...actual, verifyVatNumber: verifyVatNumberMock };
    });
    const { POST } = await import('./route');
    await POST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ country: 'DE', vatNumber: 'DE123456789' }),
      }),
    );
    expect(verifyVatNumberMock).toHaveBeenCalledWith('DE', '123456789');
  });
});
