/**
 * @vitest-environment node
 *
 * P5.x.SellsyDocumentsFlow — tests emitSellsyTypedDocumentAction
 * (pro-forma / facture + bon de commande + contact facturation + anti-doublon
 * + lien demande partenaire).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface ProspectStub {
  id: string;
  quote_items: unknown;
  promo_reason: string | null;
  is_test: boolean;
  billing_contact_id: string | null;
  billing_email_override: string | null;
  pack_code: string | null;
  booth_assignment: string | null;
  sellsy_proforma_id: string | null;
  sellsy_invoice_id: string | null;
  company: { id: string; name: string; sellsy_id: number | null };
  contact: { sellsy_contact_id: number | null } | null;
}

interface MockState {
  role: 'admin' | 'sales' | 'viewer';
  prospect: ProspectStub | null;
  companySellsyId: number | null;
  billingContactSellsyId: number | null;
  prospectUpdates: Array<Record<string, unknown>>;
  requestUpdates: Array<Record<string, unknown>>;
  auditInserts: Array<Record<string, unknown>>;
  sellsyCalls: Array<{ endpoint: string; method: string; body?: string }>;
  sellsyResponses: Map<string, unknown>;
}

const state: MockState = {
  role: 'admin',
  prospect: null,
  companySellsyId: 9999,
  billingContactSellsyId: null,
  prospectUpdates: [],
  requestUpdates: [],
  auditInserts: [],
  sellsyCalls: [],
  sellsyResponses: new Map(),
};

const PROSPECT_ID = '92d51b10-7085-4695-b257-72c61d01917a';
const PACK = {
  sellsy_product_id: 1,
  reference: 'MDS-PACK-STD',
  name: 'Pack',
  unit_price_ht: 12500,
  qty: 1,
  category: 'pack',
  sub_category: null,
  is_premium: false,
  discount_pct: 0,
};

function baseProspect(): ProspectStub {
  return {
    id: PROSPECT_ID,
    quote_items: [{ ...PACK, name: 'Pack CLASSIC' }],
    promo_reason: null,
    is_test: false,
    billing_contact_id: null,
    billing_email_override: null,
    pack_code: 'CLASSIC',
    booth_assignment: 'F4',
    sellsy_proforma_id: null,
    sellsy_invoice_id: null,
    company: { id: 'co-1', name: 'Acme Media', sellsy_id: 9999 },
    contact: { sellsy_contact_id: 7 },
  };
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: state.role, email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/sellsy/sync-prospect', () => ({
    syncProspectToSellsy: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/sellsy/sync-logger', () => ({
    logSellsyCall: vi.fn().mockResolvedValue(undefined),
  }));

  const serviceClient = {
    from(table: string) {
      if (table === 'prospects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: state.prospect,
                  error: state.prospect ? null : { message: 'not found' },
                }),
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
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { sellsy_id: state.companySellsyId }, error: null }),
            }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { sellsy_contact_id: state.billingContactSellsyId },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'document_requests') {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: () => {
              state.requestUpdates.push(patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'audit_log') {
        return {
          insert: (row: Record<string, unknown>) => {
            state.auditInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  };
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => serviceClient,
  }));

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
  vi.doMock('@/lib/sellsy/client', () => ({
    SellsyError: SellsyErrorMock,
    sellsyFetch: vi.fn(async (endpoint: string, opts?: { method?: string; body?: string }) => {
      state.sellsyCalls.push({ endpoint, method: opts?.method ?? 'GET', body: opts?.body });
      const key = `${opts?.method ?? 'GET'} ${endpoint}`;
      const resp = state.sellsyResponses.get(key);
      // Convention test : { __throw: { status, body } } → throw SellsyError.
      if (resp && typeof resp === 'object' && '__throw' in (resp as Record<string, unknown>)) {
        const t = (resp as { __throw: { status: number; body: unknown } }).__throw;
        throw new SellsyErrorMock(
          `Sellsy fetch ${endpoint} failed (${t.status})`,
          t.status,
          t.body,
        );
      }
      return resp ?? {};
    }),
  }));
}

function seedSellsyOk(type: 'proforma' | 'invoice', docId = 555) {
  const endpoint = type === 'proforma' ? '/proformas' : '/invoices';
  state.sellsyResponses.set(`POST ${endpoint}`, { data: { id: docId } });
  state.sellsyResponses.set(`GET ${endpoint}/${docId}`, {
    data: {
      number: type === 'proforma' ? 'PF-2026-001' : 'FA-2026-001',
      public_link_enabled: true,
      public_link: `https://sellsy.example/${type}/${docId}`,
    },
  });
}

describe('emitSellsyTypedDocumentAction (P5.x.SellsyDocumentsFlow)', () => {
  beforeEach(() => {
    state.role = 'admin';
    state.prospect = baseProspect();
    state.companySellsyId = 9999;
    state.billingContactSellsyId = null;
    state.prospectUpdates = [];
    state.requestUpdates = [];
    state.auditInserts = [];
    state.sellsyCalls = [];
    state.sellsyResponses = new Map();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse si role non-admin', async () => {
    state.role = 'sales';
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'proforma',
    });
    expect(r.ok).toBe(false);
    expect(state.sellsyCalls).toHaveLength(0);
  });

  it('émet une pro-forma → POST /proformas + colonnes sellsy_proforma_*', async () => {
    seedSellsyOk('proforma');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'proforma',
    });
    expect(r.ok).toBe(true);
    expect(state.sellsyCalls.some((c) => c.method === 'POST' && c.endpoint === '/proformas')).toBe(
      true,
    );
    const upd = state.prospectUpdates[0];
    expect(upd.sellsy_proforma_id).toBe('555');
    expect(upd.sellsy_proforma_number).toBe('PF-2026-001');
    expect(upd.sellsy_proforma_public_url).toBe('https://sellsy.example/proforma/555');
  });

  it('émet une facture avec bon de commande → note contient "Bon de commande N°" + PO persisté', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
      purchase_order_number: 'BC-2026-0042',
    });
    expect(r.ok).toBe(true);
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/invoices');
    const body = JSON.parse(post!.body!) as { note?: string };
    expect(body.note).toContain('Bon de commande N° BC-2026-0042');
    const upd = state.prospectUpdates[0];
    expect(upd.sellsy_invoice_id).toBe('555');
    expect(upd.purchase_order_number).toBe('BC-2026-0042');
  });

  it('facture sans BC → pas de mention bon de commande dans la note', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    await emitSellsyTypedDocumentAction({ prospect_id: PROSPECT_ID, document_type: 'invoice' });
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/invoices');
    const body = JSON.parse(post!.body!) as { note?: string };
    expect(body.note ?? '').not.toContain('Bon de commande');
  });

  it('anti-doublon : facture déjà émise → erreur, pas de POST', async () => {
    state.prospect!.sellsy_invoice_id = '111';
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
    });
    expect(r.ok).toBe(false);
    expect(state.sellsyCalls).toHaveLength(0);
  });

  it('email facturation externe → mention "Facturation à :" dans la note', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
      billing_email_override: 'compta@cabinet.fr',
    });
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/invoices');
    const body = JSON.parse(post!.body!) as { note?: string };
    expect(body.note).toContain('Facturation à : compta@cabinet.fr');
  });

  it('émission liée à une demande → document_requests passe à approved + sellsy_document_id', async () => {
    seedSellsyOk('proforma');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'proforma',
      request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(r.ok).toBe(true);
    expect(state.requestUpdates).toHaveLength(1);
    expect(state.requestUpdates[0].status).toBe('approved');
    expect(state.requestUpdates[0].sellsy_document_id).toBe('555');
  });

  it('audit log : kind=sellsy_document_emitted avec document_type + PO', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
      purchase_order_number: 'BC-9',
    });
    expect(state.auditInserts).toHaveLength(1);
    const after = state.auditInserts[0].after as Record<string, unknown>;
    expect(after.kind).toBe('sellsy_document_emitted');
    expect(after.document_type).toBe('invoice');
    expect(after.purchase_order_number).toBe('BC-9');
  });

  it('refuse si quote_items vide', async () => {
    state.prospect!.quote_items = [];
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'proforma',
    });
    expect(r.ok).toBe(false);
    expect(state.sellsyCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P5.x.SellsyInvoiceCreationFixes — Fix 1 (validate), Fix 2 (subject), Fix 3 (url)
// ---------------------------------------------------------------------------

describe('P5.x.SellsyInvoiceCreationFixes', () => {
  beforeEach(() => {
    state.role = 'admin';
    state.prospect = baseProspect();
    state.companySellsyId = 9999;
    state.billingContactSellsyId = null;
    state.prospectUpdates = [];
    state.requestUpdates = [];
    state.auditInserts = [];
    state.sellsyCalls = [];
    state.sellsyResponses = new Map();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // --- Fix 1 : validate ----------------------------------------------------

  it('Fix 1 — facture : POST /invoices/{id}/validate appelé après création (draft→due)', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
    });
    expect(r.ok).toBe(true);
    const validate = state.sellsyCalls.find(
      (c) => c.method === 'POST' && c.endpoint === '/invoices/555/validate',
    );
    expect(validate).toBeDefined();
  });

  it('Fix 1 — pro-forma : PAS de validate (document non-comptable)', async () => {
    seedSellsyOk('proforma');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    await emitSellsyTypedDocumentAction({ prospect_id: PROSPECT_ID, document_type: 'proforma' });
    const validate = state.sellsyCalls.find((c) => c.endpoint.includes('/validate'));
    expect(validate).toBeUndefined();
  });

  it('Fix 1 — validate échoue → ok:false + message + id persisté (anti-doublon)', async () => {
    state.sellsyResponses.set('POST /invoices', { data: { id: 555 } });
    state.sellsyResponses.set('POST /invoices/555/validate', {
      __throw: { status: 400, body: { error: { message: 'cannot validate' } } },
    });
    // GET re-fetch reste seedé pour le best-effort
    state.sellsyResponses.set('GET /invoices/555', {
      data: { number: 'FA-2026-001', public_link: { enabled: true, url: 'https://sellsy.link/x' } },
    });
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/finalisation a échoué/);
    // L'id est quand même persisté (la facture brouillon existe côté Sellsy).
    const upd = state.prospectUpdates.find((u) => u.sellsy_invoice_id !== undefined);
    expect(upd?.sellsy_invoice_id).toBe('555');
  });

  // --- Fix 2 : subject -----------------------------------------------------

  it('Fix 2 — payload contient subject auto (event + stand + pack)', async () => {
    seedSellsyOk('invoice');
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    await emitSellsyTypedDocumentAction({ prospect_id: PROSPECT_ID, document_type: 'invoice' });
    const post = state.sellsyCalls.find((c) => c.method === 'POST' && c.endpoint === '/invoices');
    const body = JSON.parse(post!.body!) as { subject?: string };
    expect(body.subject).toBe('MediaDays Solutions / Paris Radio Show — Stand F4 — Pack CLASSIC');
  });

  it('Fix 2 — buildInvoiceSubject : sans stand → event + pack', async () => {
    mockEnv();
    const { buildSellsySubject: buildInvoiceSubject } = await import('@/lib/sellsy/subject');
    expect(
      buildInvoiceSubject({
        packCode: 'PREMIUM',
        boothAssignment: null,
        items: [{ category: 'pack', name: 'Pack PREMIUM' }],
      }),
    ).toBe('MediaDays Solutions / Paris Radio Show — Pack PREMIUM');
  });

  it('Fix 2 — buildInvoiceSubject : fallback pack_code si pas de ligne pack nommée', async () => {
    mockEnv();
    const { buildSellsySubject: buildInvoiceSubject } = await import('@/lib/sellsy/subject');
    expect(
      buildInvoiceSubject({
        packCode: 'DUO',
        boothAssignment: 'C2',
        items: [{ category: 'option', name: 'Logo' }],
      }),
    ).toBe('MediaDays Solutions / Paris Radio Show — Stand C2 — Pack DUO');
  });

  // --- Fix 3 : url stable (public_link.url objet) ---------------------------

  it('Fix 3 — GET public_link objet { enabled, url } → URL stable stockée (pas pdf_link cassé)', async () => {
    state.sellsyResponses.set('POST /invoices', { data: { id: 555 } });
    state.sellsyResponses.set('POST /invoices/555/validate', {});
    state.sellsyResponses.set('GET /invoices/555', {
      data: {
        number: 'FA-2026-001',
        public_link: { enabled: true, url: 'https://sellsy.link/STABLE' },
        pdf_link: 'https://file.sellsy.com/?id=BROKEN',
      },
    });
    mockEnv();
    const { emitSellsyTypedDocumentAction } = await import('./quote-builder-actions');
    const r = await emitSellsyTypedDocumentAction({
      prospect_id: PROSPECT_ID,
      document_type: 'invoice',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.public_url).toBe('https://sellsy.link/STABLE');
    const upd = state.prospectUpdates.find((u) => u.sellsy_invoice_public_url !== undefined);
    expect(upd?.sellsy_invoice_public_url).toBe('https://sellsy.link/STABLE');
  });
});
