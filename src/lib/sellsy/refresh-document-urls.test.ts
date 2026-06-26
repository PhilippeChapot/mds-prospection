/**
 * @vitest-environment node
 *
 * P5.x.SellsyInvoiceCreationFixes (Fix 3) — refreshSellsyDocumentUrls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  prospect: Record<string, unknown> | null;
  prospectUpdates: Array<Record<string, unknown>>;
  sellsyResponses: Map<string, unknown>;
  sellsyCalls: string[];
}

const state: MockState = {
  prospect: null,
  prospectUpdates: [],
  sellsyResponses: new Map(),
  sellsyCalls: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'prospects') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: state.prospect, error: null }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => {
                state.prospectUpdates.push(patch);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        return {};
      },
    }),
  }));
  vi.doMock('./client', () => ({
    sellsyFetch: vi.fn(async (endpoint: string) => {
      state.sellsyCalls.push(endpoint);
      const resp = state.sellsyResponses.get(endpoint);
      if (resp && typeof resp === 'object' && '__throw' in (resp as Record<string, unknown>)) {
        throw new Error('Sellsy GET failed');
      }
      return resp ?? {};
    }),
  }));
}

describe('refreshSellsyDocumentUrls', () => {
  beforeEach(() => {
    state.prospect = null;
    state.prospectUpdates = [];
    state.sellsyResponses = new Map();
    state.sellsyCalls = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('facture finalisée : GET /invoices/{id} → URL stable (public_link.url) re-posée', async () => {
    state.prospect = {
      sellsy_devis_id: null,
      sellsy_proforma_id: null,
      sellsy_invoice_id: '555',
    };
    state.sellsyResponses.set('/invoices/555', {
      data: {
        number: 'F-2026-001',
        public_link: { enabled: true, url: 'https://sellsy.link/STABLE' },
        pdf_link: 'https://file.sellsy.com/?id=BROKEN',
      },
    });
    mockEnv();
    const { refreshSellsyDocumentUrls } = await import('./refresh-document-urls');
    const r = await refreshSellsyDocumentUrls('p1');
    expect(r.refreshed).toEqual(['/invoices']);
    expect(state.prospectUpdates).toHaveLength(1);
    expect(state.prospectUpdates[0].sellsy_invoice_public_url).toBe('https://sellsy.link/STABLE');
    expect(state.prospectUpdates[0].sellsy_invoice_number).toBe('F-2026-001');
    // ne touche pas aux colonnes devis/proforma (id absents)
    expect(state.prospectUpdates[0]).not.toHaveProperty('sellsy_devis_public_url');
  });

  it('devis-only : ne GET que /estimates, robuste à l’absence de facture', async () => {
    state.prospect = {
      sellsy_devis_id: '42',
      sellsy_proforma_id: null,
      sellsy_invoice_id: null,
    };
    state.sellsyResponses.set('/estimates/42', {
      data: { public_link: { enabled: true, url: 'https://sellsy.link/DEVIS' } },
    });
    mockEnv();
    const { refreshSellsyDocumentUrls } = await import('./refresh-document-urls');
    const r = await refreshSellsyDocumentUrls('p1');
    expect(state.sellsyCalls).toEqual(['/estimates/42']);
    expect(r.refreshed).toEqual(['/estimates']);
    expect(state.prospectUpdates[0].sellsy_devis_public_url).toBe('https://sellsy.link/DEVIS');
  });

  it('prospect sans aucun document → no-op (aucun GET, aucun update)', async () => {
    state.prospect = {
      sellsy_devis_id: null,
      sellsy_proforma_id: null,
      sellsy_invoice_id: null,
    };
    mockEnv();
    const { refreshSellsyDocumentUrls } = await import('./refresh-document-urls');
    const r = await refreshSellsyDocumentUrls('p1');
    expect(r.refreshed).toEqual([]);
    expect(state.sellsyCalls).toHaveLength(0);
    expect(state.prospectUpdates).toHaveLength(0);
  });

  it('GET Sellsy échoue → best-effort, pas de throw, pas d’update', async () => {
    state.prospect = {
      sellsy_devis_id: null,
      sellsy_proforma_id: null,
      sellsy_invoice_id: '999',
    };
    state.sellsyResponses.set('/invoices/999', { __throw: true });
    mockEnv();
    const { refreshSellsyDocumentUrls } = await import('./refresh-document-urls');
    const r = await refreshSellsyDocumentUrls('p1');
    expect(r.refreshed).toEqual([]);
    expect(state.prospectUpdates).toHaveLength(0);
  });
});
