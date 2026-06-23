/**
 * @vitest-environment node
 *
 * P5.x.SellsyDocumentsFlow — tests submitDocumentRequestAction (partenaire)
 * + rejectDocumentRequestAction (admin).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SubmitState {
  session: { contactId: string; prospectId: string | null };
  existingPending: { id: string } | null;
  inserted: Array<Record<string, unknown>>;
  emails: Array<{ to: string; subject: string }>;
}

const sub: SubmitState = {
  session: { contactId: 'contact-1', prospectId: 'prospect-1' },
  existingPending: null,
  inserted: [],
  emails: [],
};

function chainSelect(resolveData: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: resolveData, error: null }),
    maybeSingle: () => Promise.resolve({ data: resolveData, error: null }),
  };
  return chain;
}

function mockSubmitEnv() {
  vi.doMock('@/lib/espace-partenaire/session', () => ({
    requireContactSession: () => Promise.resolve(sub.session),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (p: { to: string; subject: string }) => {
      sub.emails.push({ to: p.to, subject: p.subject });
      return { id: 'em_1' };
    }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'document_requests') {
          return {
            select: () => {
              const chain: Record<string, unknown> = {
                eq: () => chain,
                maybeSingle: () => Promise.resolve({ data: sub.existingPending, error: null }),
              };
              return chain;
            },
            insert: (row: Record<string, unknown>) => ({
              select: () => ({
                single: () => {
                  sub.inserted.push(row);
                  return Promise.resolve({ data: { id: 'req-1' }, error: null });
                },
              }),
            }),
          };
        }
        if (table === 'prospects') {
          return chainSelect({ id: 'prospect-1', company: { name: 'Acme Media' } });
        }
        if (table === 'contacts') {
          return chainSelect({ first_name: 'Jean', last_name: 'Dup', email: 'jean@acme.fr' });
        }
        return {};
      },
    }),
  }));
}

describe('submitDocumentRequestAction (P5.x)', () => {
  beforeEach(() => {
    sub.session = { contactId: 'contact-1', prospectId: 'prospect-1' };
    sub.existingPending = null;
    sub.inserted = [];
    sub.emails = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('proforma OK → INSERT + notification admin', async () => {
    mockSubmitEnv();
    const { submitDocumentRequestAction } = await import('./document-requests-actions');
    const r = await submitDocumentRequestAction({ locale: 'fr', document_type: 'proforma' });
    expect(r.ok).toBe(true);
    expect(sub.inserted).toHaveLength(1);
    expect(sub.inserted[0].document_type).toBe('proforma');
    expect(sub.emails).toHaveLength(1);
    expect(sub.emails[0].subject).toContain('pro-forma');
  });

  it('doublon pending → erreur, pas d’INSERT', async () => {
    sub.existingPending = { id: 'req-existing' };
    mockSubmitEnv();
    const { submitDocumentRequestAction } = await import('./document-requests-actions');
    const r = await submitDocumentRequestAction({ locale: 'fr', document_type: 'proforma' });
    expect(r.ok).toBe(false);
    expect(sub.inserted).toHaveLength(0);
  });

  it('aucun prospect lié → erreur', async () => {
    sub.session = { contactId: 'contact-1', prospectId: null };
    mockSubmitEnv();
    const { submitDocumentRequestAction } = await import('./document-requests-actions');
    const r = await submitDocumentRequestAction({ locale: 'fr', document_type: 'invoice' });
    expect(r.ok).toBe(false);
    expect(sub.inserted).toHaveLength(0);
  });

  it('facture requires_purchase_order sans numéro → refus Zod', async () => {
    mockSubmitEnv();
    const { submitDocumentRequestAction } = await import('./document-requests-actions');
    const r = await submitDocumentRequestAction({
      locale: 'fr',
      document_type: 'invoice',
      requires_purchase_order: true,
    });
    expect(r.ok).toBe(false);
    expect(sub.inserted).toHaveLength(0);
  });

  it('facture avec BC → INSERT purchase_order_number renseigné', async () => {
    mockSubmitEnv();
    const { submitDocumentRequestAction } = await import('./document-requests-actions');
    const r = await submitDocumentRequestAction({
      locale: 'fr',
      document_type: 'invoice',
      requires_purchase_order: true,
      purchase_order_number: 'BC-77',
    });
    expect(r.ok).toBe(true);
    expect(sub.inserted[0].purchase_order_number).toBe('BC-77');
    expect(sub.inserted[0].requires_purchase_order).toBe(true);
  });
});

// ---------------------------------------------------------------------------

interface RejectState {
  role: 'admin' | 'sales';
  updates: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
}
const rej: RejectState = { role: 'admin', updates: [], audits: [] };

function mockRejectEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: rej.role, email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'document_requests') {
          return {
            update: (patch: Record<string, unknown>) => {
              const chain: Record<string, unknown> = {
                eq: () => {
                  rej.updates.push(patch);
                  return chain;
                },
                then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
              };
              return chain;
            },
          };
        }
        if (table === 'audit_log') {
          return {
            insert: (row: Record<string, unknown>) => {
              rej.audits.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    }),
  }));
}

describe('rejectDocumentRequestAction (P5.x)', () => {
  beforeEach(() => {
    rej.role = 'admin';
    rej.updates = [];
    rej.audits = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('admin → status rejected + audit log', async () => {
    mockRejectEnv();
    const { rejectDocumentRequestAction } = await import('@/lib/admin/document-requests/actions');
    const r = await rejectDocumentRequestAction({
      request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      prospect_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(r.ok).toBe(true);
    expect(rej.updates[0].status).toBe('rejected');
    expect(rej.audits).toHaveLength(1);
    expect((rej.audits[0].after as Record<string, unknown>).kind).toBe('document_request_rejected');
  });

  it('refuse si non-admin', async () => {
    rej.role = 'sales';
    mockRejectEnv();
    const { rejectDocumentRequestAction } = await import('@/lib/admin/document-requests/actions');
    const r = await rejectDocumentRequestAction({
      request_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      prospect_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(r.ok).toBe(false);
    expect(rej.updates).toHaveLength(0);
  });
});
