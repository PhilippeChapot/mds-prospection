/**
 * @vitest-environment node
 *
 * P6.x.5-nonies — tests helpers Sellsy cancel + comment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SellsyCallLog {
  endpoint: string;
  method: string;
  body?: string;
}

const sellsyCalls: SellsyCallLog[] = [];
let nextThrow: { status: number; body: unknown } | null = null;

function mockSellsy() {
  class SellsyErrorMock extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'SellsyError';
      this.status = status;
      this.body = body;
    }
  }
  vi.doMock('./client', () => ({
    SellsyError: SellsyErrorMock,
    sellsyFetch: vi.fn(async (endpoint: string, opts?: { method?: string; body?: string }) => {
      sellsyCalls.push({ endpoint, method: opts?.method ?? 'GET', body: opts?.body });
      if (nextThrow) {
        const t = nextThrow;
        nextThrow = null;
        throw new SellsyErrorMock(`Sellsy ${endpoint} ${t.status}`, t.status, t.body);
      }
      return {};
    }),
  }));
}

describe('cancelSellsyDevis (P6.x.5-nonies)', () => {
  beforeEach(() => {
    sellsyCalls.length = 0;
    nextThrow = null;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("PUT /estimates/{id}/status avec body {status:'cancelled'} (format OpenAPI Sellsy V2)", async () => {
    mockSellsy();
    const { cancelSellsyDevis } = await import('./cancel-devis');
    const r = await cancelSellsyDevis({ sellsy_devis_id: 1234, reason: 'remplacé' });
    expect(r).toEqual({ ok: true, cancelled: true });
    expect(sellsyCalls).toHaveLength(1);
    expect(sellsyCalls[0].endpoint).toBe('/estimates/1234/status');
    expect(sellsyCalls[0].method).toBe('PUT');
    expect(JSON.parse(sellsyCalls[0].body!)).toEqual({ status: 'cancelled' });
  });

  it('Sellsy refuse (409, devis déjà payé) → ok:false, jamais throw, message inclut body', async () => {
    mockSellsy();
    nextThrow = { status: 409, body: { error: { message: 'devis already invoiced' } } };
    const { cancelSellsyDevis } = await import('./cancel-devis');
    const r = await cancelSellsyDevis({ sellsy_devis_id: 555 });
    expect(r.ok).toBe(false);
    expect(r.cancelled).toBe(false);
    expect(r.message).toMatch(/409/);
    expect(r.message).toMatch(/already invoiced/);
  });
});

describe('addCommentToSellsyDevis (P6.x.5-nonies)', () => {
  beforeEach(() => {
    sellsyCalls.length = 0;
    nextThrow = null;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("POST /comments avec related:[{id, type:'estimate'}] (format OpenAPI)", async () => {
    mockSellsy();
    const { addCommentToSellsyDevis } = await import('./cancel-devis');
    const r = await addCommentToSellsyDevis({
      sellsy_devis_id: 42,
      comment: 'Devis remplacé par D-2026-0042',
    });
    expect(r.ok).toBe(true);
    expect(sellsyCalls).toHaveLength(1);
    expect(sellsyCalls[0].endpoint).toBe('/comments');
    expect(sellsyCalls[0].method).toBe('POST');
    expect(JSON.parse(sellsyCalls[0].body!)).toEqual({
      description: 'Devis remplacé par D-2026-0042',
      related: [{ id: 42, type: 'estimate' }],
    });
  });

  it('Sellsy plante sur /comments → ok:false (best-effort, jamais throw)', async () => {
    mockSellsy();
    nextThrow = { status: 500, body: { error: 'internal' } };
    const { addCommentToSellsyDevis } = await import('./cancel-devis');
    const r = await addCommentToSellsyDevis({ sellsy_devis_id: 7, comment: 'x' });
    expect(r.ok).toBe(false);
  });
});
