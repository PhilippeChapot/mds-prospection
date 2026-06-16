/**
 * @vitest-environment node
 *
 * P15.4 — tests workflow invitation (submit hybride + approve + reject).
 * isLowRiskCountry est RÉEL (pas mocké) ; PDF/storage/email sont mockés.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN_ID = 'aa000000-0000-4000-8000-000000000001';
const VISITOR_ID = 'bb000000-0000-4000-8000-000000000002';

const emails: Array<{ to: string; category?: string }> = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const deletes: Array<{ table: string }> = [];
const generateCalls: string[] = [];

const scenario = {
  visitorRow: {
    language: 'fr',
    contact: { first_name: 'Sami', last_name: 'B', email: 'sami@acme.tn' },
  } as Record<string, unknown> | null,
  invRow: null as Record<string, unknown> | null,
  users: [{ email: 'boss@mds.fr', full_name: 'Big Boss' }],
};

function reset() {
  emails.length = 0;
  inserts.length = 0;
  updates.length = 0;
  upserts.length = 0;
  deletes.length = 0;
  generateCalls.length = 0;
  scenario.visitorRow = {
    language: 'fr',
    contact: { first_name: 'Sami', last_name: 'B', email: 'sami@acme.tn' },
  };
  scenario.invRow = null;
  scenario.users = [{ email: 'boss@mds.fr', full_name: 'Big Boss' }];
}

function makeFrom(table: string) {
  return {
    select() {
      const chain = {
        eq() {
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'visitors') return { data: scenario.visitorRow, error: null };
          if (table === 'visitor_invitation_data') return { data: scenario.invRow, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: table === 'users' ? scenario.users : [], error: null })),
      };
      return chain;
    },
    upsert(row: Record<string, unknown>) {
      upserts.push({ table, row });
      return { select: () => ({ single: async () => ({ data: { id: 'inv-1' }, error: null }) }) };
    },
    update(row: Record<string, unknown>) {
      return {
        eq: async () => {
          updates.push({ table, row });
          return { error: null };
        },
      };
    },
    insert(row: Record<string, unknown>) {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
    delete() {
      return {
        eq: async () => {
          deletes.push({ table });
          return { error: null };
        },
      };
    },
  };
}

function mockEnv() {
  vi.doMock('@/lib/espace-visiteur/session', () => ({
    requireVisitorSession: vi.fn(async () => ({ visitorId: VISITOR_ID })),
  }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireSuperAdmin: vi.fn(async () => ({ id: ADMIN_ID, role: 'super_admin' })),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeFrom(t) }),
  }));
  vi.doMock('@/lib/pdf/generate-invitation', () => ({
    generateInvitationPdf: vi.fn(async (input: { locale?: string }) => {
      generateCalls.push(input?.locale ?? '?');
      return Buffer.from('%PDF-fake');
    }),
  }));
  vi.doMock('@/lib/storage/visitor-invitations', () => ({
    uploadInvitationPdf: vi.fn(async () => 'path/x.pdf'),
    getInvitationPdfSignedUrl: vi.fn(async () => 'https://signed/x.pdf'),
  }));
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(
      async (p: { to: string; tags?: { name: string; value: string }[] }) => {
        emails.push({ to: p.to, category: p.tags?.find((t) => t.name === 'category')?.value });
        return { id: 'e1' };
      },
    ),
  }));
}

async function load() {
  mockEnv();
  return import('./invitation-actions');
}

const baseInput = {
  passport_number: 'AB123456',
  passport_issue_date: '2020-01-01',
  passport_expiry: '2030-01-01',
  birth_date: '1990-01-01',
  birth_place: 'Tunis',
  nationality: 'Tunisienne',
  profession: 'Journaliste',
  company_name: 'ACME',
  company_full_address: '1 rue X',
  postal_code: '1000',
  city: 'Tunis',
  country: 'Tunisie',
};

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('submitVisitorInvitationRequestAction (P15.4)', () => {
  it('pays low-risk (US) → auto_approved + PDF généré + email lettre', async () => {
    const { submitVisitorInvitationRequestAction } = await load();
    const res = await submitVisitorInvitationRequestAction('fr', {
      ...baseInput,
      passport_country: 'US',
    });
    expect(res).toMatchObject({ auto_approved: true, status: 'auto_approved' });
    expect(generateCalls).toHaveLength(1);
    expect(emails.some((e) => e.category === 'visitor_invitation_letter')).toBe(true);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'visitor_invitation_request_submitted',
    );
  });

  it('pays à risque (TN) → pending + notif super_admin + email visiteur, pas de PDF', async () => {
    const { submitVisitorInvitationRequestAction } = await load();
    const res = await submitVisitorInvitationRequestAction('fr', {
      ...baseInput,
      passport_country: 'TN',
    });
    expect(res).toMatchObject({ auto_approved: false, status: 'pending' });
    expect(generateCalls).toHaveLength(0);
    expect(emails.some((e) => e.category === 'visitor_invitation_validation')).toBe(true);
    expect(emails.some((e) => e.category === 'visitor_invitation_pending')).toBe(true);
  });

  it('input invalide (passport_country trop long) → throw', async () => {
    const { submitVisitorInvitationRequestAction } = await load();
    await expect(
      submitVisitorInvitationRequestAction('fr', { ...baseInput, passport_country: 'USA' }),
    ).rejects.toBeTruthy();
  });
});

describe('adminApproveInvitationAction (P15.4)', () => {
  it('pending → approved + PDF généré + audit', async () => {
    scenario.invRow = {
      id: 'inv-1',
      approval_status: 'pending',
      ...baseInput,
      passport_country: 'TN',
    };
    const { adminApproveInvitationAction } = await load();
    const res = await adminApproveInvitationAction({ visitor_id: VISITOR_ID });
    expect(res).toEqual({ success: true });
    expect(generateCalls).toHaveLength(1);
    const upd = updates.find(
      (u) => u.table === 'visitor_invitation_data' && u.row.approval_status === 'approved',
    );
    expect(upd).toBeDefined();
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('invitation_approved_by_admin');
  });

  it('déjà approuvée → throw', async () => {
    scenario.invRow = { id: 'inv-1', approval_status: 'approved' };
    const { adminApproveInvitationAction } = await load();
    await expect(adminApproveInvitationAction({ visitor_id: VISITOR_ID })).rejects.toThrow(/déjà/);
  });
});

describe('adminRejectInvitationAction (P15.4)', () => {
  it('refuse + motif + email refus + audit', async () => {
    scenario.invRow = { id: 'inv-1', approval_status: 'pending' };
    const { adminRejectInvitationAction } = await load();
    const res = await adminRejectInvitationAction({
      visitor_id: VISITOR_ID,
      reason: 'Documents insuffisants',
    });
    expect(res).toEqual({ success: true });
    const upd = updates.find(
      (u) => u.table === 'visitor_invitation_data' && u.row.approval_status === 'rejected',
    );
    expect(upd?.row.rejection_reason).toBe('Documents insuffisants');
    expect(emails.some((e) => e.category === 'visitor_invitation_rejected')).toBe(true);
  });
});

// ─── P15.4-bis ─────────────────────────────────────────────────────────────
describe('submit — locale lettre (P15.4-bis)', () => {
  it('locale="en" → PDF généré en EN + locale stockée dans l’upsert', async () => {
    const { submitVisitorInvitationRequestAction } = await load();
    await submitVisitorInvitationRequestAction('fr', {
      ...baseInput,
      passport_country: 'US',
      locale: 'en',
    });
    expect(generateCalls).toContain('en');
    const up = upserts.find((u) => u.table === 'visitor_invitation_data');
    expect((up?.row as Record<string, unknown>).locale).toBe('en');
  });
});

describe('adminEditInvitationDataAction (P15.4-bis)', () => {
  it('met à jour les données + edited_by + audit', async () => {
    scenario.invRow = { id: 'inv-1', approval_status: 'pending' };
    const { adminEditInvitationDataAction } = await load();
    const res = await adminEditInvitationDataAction({
      visitor_id: VISITOR_ID,
      data: { ...baseInput, passport_country: 'TN', profession: 'Réalisateur', locale: 'fr' },
    });
    expect(res).toEqual({ success: true });
    const upd = updates.find(
      (u) => u.table === 'visitor_invitation_data' && u.row.edited_by === ADMIN_ID,
    );
    expect(upd?.row.profession).toBe('Réalisateur');
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe(
      'invitation_data_edited_by_admin',
    );
  });
});

describe('adminRegenerateInvitationPdfAction (P15.4-bis)', () => {
  it('régénère le PDF (locale stockée), incrémente le compteur, sans email', async () => {
    scenario.invRow = {
      id: 'inv-1',
      approval_status: 'approved',
      ...baseInput,
      passport_country: 'TN',
      locale: 'en',
      regenerated_count: 2,
    };
    const { adminRegenerateInvitationPdfAction } = await load();
    const res = await adminRegenerateInvitationPdfAction({ visitor_id: VISITOR_ID });
    expect(res).toEqual({ success: true });
    expect(generateCalls).toContain('en');
    expect(emails).toHaveLength(0); // notify=false
    const counter = updates.find(
      (u) => u.table === 'visitor_invitation_data' && 'regenerated_count' in u.row,
    );
    expect(counter?.row.regenerated_count).toBe(3);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('invitation_pdf_regenerated');
  });
});

describe('adminDeleteInvitationAction (P15.4-bis)', () => {
  it('supprime la demande + audit (action delete)', async () => {
    const { adminDeleteInvitationAction } = await load();
    const res = await adminDeleteInvitationAction({ visitor_id: VISITOR_ID });
    expect(res).toEqual({ success: true });
    expect(deletes.some((d) => d.table === 'visitor_invitation_data')).toBe(true);
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit?.row.action).toBe('delete');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('invitation_deleted_by_admin');
  });

  it('ne génère aucun PDF lors de la suppression', async () => {
    const { adminDeleteInvitationAction } = await load();
    await adminDeleteInvitationAction({ visitor_id: VISITOR_ID });
    expect(generateCalls).toHaveLength(0);
  });

  it('ID invalide → throw', async () => {
    const { adminDeleteInvitationAction } = await load();
    await expect(adminDeleteInvitationAction({ visitor_id: 'not-a-uuid' })).rejects.toThrow();
  });
});

describe('garde-fous P15.4-bis', () => {
  it('submit sans locale → défaut fr (PDF en fr)', async () => {
    const { submitVisitorInvitationRequestAction } = await load();
    await submitVisitorInvitationRequestAction('fr', { ...baseInput, passport_country: 'US' });
    expect(generateCalls).toContain('fr');
  });

  it('regenerate sans demande existante → throw', async () => {
    scenario.invRow = null;
    const { adminRegenerateInvitationPdfAction } = await load();
    await expect(adminRegenerateInvitationPdfAction({ visitor_id: VISITOR_ID })).rejects.toThrow(
      /introuvable/,
    );
  });

  it('edit sans demande existante → throw', async () => {
    scenario.invRow = null;
    const { adminEditInvitationDataAction } = await load();
    await expect(
      adminEditInvitationDataAction({
        visitor_id: VISITOR_ID,
        data: { ...baseInput, passport_country: 'TN', locale: 'fr' },
      }),
    ).rejects.toThrow(/introuvable/);
  });
});
