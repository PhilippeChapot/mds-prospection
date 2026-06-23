/**
 * @vitest-environment node
 *
 * P11.x.MultiPartnerAccess — tests grantPartnerAccessAction,
 * revokePartnerAccessAction, resendPartnerMagicLinkAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── State mock ───────────────────────────────────────────────────────────────

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUPER_ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMPANY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GRANT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const state = {
  contact: null as null | {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    company_id: string | null;
    language: string | null;
  },
  grants: [] as Array<{
    id: string;
    contact_id: string;
    company_id: string;
    revoked_at: string | null;
  }>,
  insertedGrant: null as null | { id: string },
  updatedGrant: null as null | Record<string, unknown>,
  auditInserts: [] as Array<Record<string, unknown>>,
  resendCalls: 0,
  isSuperAdmin: false,
};

function resetState() {
  state.contact = null;
  state.grants = [];
  state.insertedGrant = null;
  state.updatedGrant = null;
  state.auditInserts = [];
  state.resendCalls = 0;
  state.isSuperAdmin = false;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));

  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: ADMIN_ID, role: 'admin' }),
    requireSuperAdmin: () => {
      if (!state.isSuperAdmin) throw new Error('Réservé super_admin');
      return Promise.resolve({ id: SUPER_ADMIN_ID, role: 'super_admin' });
    },
  }));

  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: () => {
      state.resendCalls++;
      return Promise.resolve({ id: 'resend-ok' });
    },
  }));

  vi.doMock('@/lib/espace-partenaire/jwt', () => ({
    signContactMagicToken: () => Promise.resolve('mock-token'),
  }));

  vi.doMock('@/lib/resend/templates/espace-partenaire-magic-link', () => ({
    renderEspacePartenaireMagicLinkTemplate: () => ({
      subject: 'Test',
      html: '<p>test</p>',
      text: 'test',
    }),
  }));

  vi.doMock('@/lib/format/name', () => ({
    capitalizeName: (s: string) => s,
  }));

  vi.doMock('next/cache', () => ({ revalidatePath: () => undefined }));
}

function makeClient() {
  return {
    from: (table: string) => {
      if (table === 'contacts') return makeContactsChain();
      if (table === 'partner_access_grants') return makeGrantsChain();
      if (table === 'audit_log') return makeAuditChain();
      return makeFallbackChain();
    },
  };
}

function makeContactsChain() {
  let contactId: string | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (_col: string, val: string) => {
      contactId = val;
      return chain;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: contactId && state.contact?.id === contactId ? state.contact : null,
        error: null,
      }),
  };
  return chain;
}

function makeGrantsChain() {
  let filterContactId: string | null = null;
  let filterGrantId: string | null = null;
  let filterNull = false;

  const matchGrant = (g: Record<string, unknown>) => {
    if (filterContactId && g.contact_id !== filterContactId) return false;
    if (filterGrantId && g.id !== filterGrantId) return false;
    if (filterNull && g.revoked_at !== null && g.revoked_at !== undefined) return false;
    return true;
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (data: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          state.insertedGrant = { id: GRANT_ID, ...data };
          return Promise.resolve({ data: { id: GRANT_ID }, error: null });
        },
      }),
    }),
    update: (data: Record<string, unknown>) => ({
      eq: () => {
        state.updatedGrant = data;
        return Promise.resolve({ error: null });
      },
    }),
    eq: (_col: string, val: string) => {
      if (_col === 'contact_id') filterContactId = val;
      if (_col === 'id') filterGrantId = val;
      return chain;
    },
    is: (_col: string, val: unknown) => {
      if (val === null) filterNull = true;
      return chain;
    },
    maybeSingle: () => {
      const match = state.grants.find(matchGrant);
      return Promise.resolve({ data: match ?? null, error: null });
    },
  };
  return chain;
}

function makeAuditChain() {
  return {
    insert: (row: Record<string, unknown>) => {
      state.auditInserts.push(row);
      return Promise.resolve({ error: null });
    },
  };
}

function makeFallbackChain() {
  const ch: Record<string, unknown> = {
    select: () => ch,
    eq: () => ch,
    is: () => ch,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return ch;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('grantPartnerAccessAction', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    mockEnv();
  });
  afterEach(() => vi.restoreAllMocks());

  it('1. OK → grant créé + audit log + magic link envoyé', async () => {
    state.contact = {
      id: CONTACT_ID,
      first_name: 'Sophie',
      last_name: 'Martin',
      email: 'sophie@winmedia.fr',
      company_id: COMPANY_ID,
      language: 'fr',
    };

    const { grantPartnerAccessAction } = await import('../grant-actions');
    const r = await grantPartnerAccessAction({
      contact_id: CONTACT_ID,
      role: 'collaborator',
      send_magic_link: true,
    });

    expect(r.success).toBe(true);
    if (r.success) expect(r.grant_id).toBe(GRANT_ID);
    expect(state.insertedGrant).not.toBeNull();
    expect(state.auditInserts).toHaveLength(1);
    expect(state.auditInserts[0]).toMatchObject({
      action: 'create',
      entity_type: 'partner_access_grant',
    });
    expect(state.resendCalls).toBe(1);
  });

  it('2. Contact sans email → return error', async () => {
    state.contact = {
      id: CONTACT_ID,
      first_name: 'NoEmail',
      last_name: null,
      email: '',
      company_id: COMPANY_ID,
      language: null,
    };

    const { grantPartnerAccessAction } = await import('../grant-actions');
    const r = await grantPartnerAccessAction({ contact_id: CONTACT_ID });

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/email/i);
  });

  it('3. Contact sans company_id → return error', async () => {
    state.contact = {
      id: CONTACT_ID,
      first_name: 'NoCompany',
      last_name: null,
      email: 'no@company.fr',
      company_id: null,
      language: null,
    };

    const { grantPartnerAccessAction } = await import('../grant-actions');
    const r = await grantPartnerAccessAction({ contact_id: CONTACT_ID });

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/soci/i);
  });

  it('4. Doublon (grant actif existant) → return existing_grant_id', async () => {
    state.contact = {
      id: CONTACT_ID,
      first_name: 'Sophie',
      last_name: 'Martin',
      email: 'sophie@winmedia.fr',
      company_id: COMPANY_ID,
      language: null,
    };
    state.grants = [
      { id: GRANT_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID, revoked_at: null },
    ];

    const { grantPartnerAccessAction } = await import('../grant-actions');
    const r = await grantPartnerAccessAction({ contact_id: CONTACT_ID });

    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.existing_grant_id).toBe(GRANT_ID);
      expect(r.error).toMatch(/déjà/i);
    }
  });

  it('5. send_magic_link=false → Resend non appelé', async () => {
    state.contact = {
      id: CONTACT_ID,
      first_name: 'Sophie',
      last_name: null,
      email: 'sophie@winmedia.fr',
      company_id: COMPANY_ID,
      language: null,
    };

    const { grantPartnerAccessAction } = await import('../grant-actions');
    const r = await grantPartnerAccessAction({
      contact_id: CONTACT_ID,
      send_magic_link: false,
    });

    expect(r.success).toBe(true);
    expect(state.resendCalls).toBe(0);
  });
});

describe('revokePartnerAccessAction', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    mockEnv();
  });
  afterEach(() => vi.restoreAllMocks());

  it('6. OK (super_admin) → revoked_at set + audit', async () => {
    state.isSuperAdmin = true;
    state.grants = [
      { id: GRANT_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID, revoked_at: null },
    ];

    const { revokePartnerAccessAction } = await import('../grant-actions');
    const r = await revokePartnerAccessAction(GRANT_ID);

    expect(r.success).toBe(true);
    expect(state.auditInserts).toHaveLength(1);
    expect(state.auditInserts[0]).toMatchObject({
      action: 'delete',
      entity_type: 'partner_access_grant',
    });
  });

  it('7. Non super_admin → throw', async () => {
    state.isSuperAdmin = false;

    const { revokePartnerAccessAction } = await import('../grant-actions');
    await expect(revokePartnerAccessAction(GRANT_ID)).rejects.toThrow();
  });

  it('8. Grant déjà révoqué → return error', async () => {
    state.isSuperAdmin = true;
    state.grants = [
      {
        id: GRANT_ID,
        contact_id: CONTACT_ID,
        company_id: COMPANY_ID,
        revoked_at: '2026-01-01T00:00:00Z',
      },
    ];

    const { revokePartnerAccessAction } = await import('../grant-actions');
    const r = await revokePartnerAccessAction(GRANT_ID);

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/révoqué/i);
  });
});

describe('resendPartnerMagicLinkAction', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    mockEnv();
  });
  afterEach(() => vi.restoreAllMocks());

  it('9. OK → Resend appelé', async () => {
    state.grants = [
      { id: GRANT_ID, contact_id: CONTACT_ID, company_id: COMPANY_ID, revoked_at: null },
    ];
    state.contact = {
      id: CONTACT_ID,
      first_name: 'Sophie',
      last_name: null,
      email: 'sophie@winmedia.fr',
      company_id: COMPANY_ID,
      language: 'fr',
    };

    const { resendPartnerMagicLinkAction } = await import('../grant-actions');
    const r = await resendPartnerMagicLinkAction(CONTACT_ID);

    expect(r.success).toBe(true);
    expect(state.resendCalls).toBe(1);
  });

  it('10. Grant inexistant → return error', async () => {
    state.grants = [];

    const { resendPartnerMagicLinkAction } = await import('../grant-actions');
    const r = await resendPartnerMagicLinkAction(CONTACT_ID);

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/actif/i);
  });
});
