/**
 * @vitest-environment node
 *
 * P5.x.1 — tests server actions admin users.
 *
 * Couvre :
 *   - super_admin gating (toutes les writes)
 *   - inviteUserAction : create + email anti-doublon
 *   - updateUserRoleAction : change role + garde-fou dernier super_admin
 *   - archiveUserAction : soft delete + garde-fou
 *   - unarchiveUserAction : restore
 *   - resendInviteAction : magic link re-déclenché
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface UserStub {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'sales' | 'super_admin';
  totp_enabled: boolean;
  language: 'fr' | 'en';
  last_login_at: string | null;
  archived_at: string | null;
  created_at: string;
}

const state = {
  adminRole: 'super_admin' as 'admin' | 'sales' | 'super_admin' | null,
  rows: [] as UserStub[],
  audit: [] as Array<{ row: Record<string, unknown> }>,
  authInvites: [] as Array<{ email: string; data?: Record<string, unknown> }>,
  authInviteShouldFail: false,
  authInviteUserId: 'invited-user-uuid',
  resendCalls: [] as Array<{ to: string; subject: string }>,
  resendShouldFail: false,
  lastGenerateLinkOpts: undefined as
    | { data?: Record<string, unknown>; redirectTo?: string }
    | undefined,
  authDeletes: [] as string[],
  authDeleteShouldFail: false,
};

const SUPER_1 = '11111111-1111-4111-8111-111111111111';
const SUPER_2 = '22222222-2222-4222-8222-222222222222';
const ADMIN_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireSuperAdmin: vi.fn(async () => {
      if (state.adminRole !== 'super_admin') {
        throw new Error('Réservé aux super_admin.');
      }
      return {
        id: 'a0000000-0000-4000-8000-000000000001',
        email: 's@b',
        full_name: null,
        role: 'super_admin' as const,
      };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
  // P5.x.1-bis : mock Resend pour ne pas appeler l'API réelle.
  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: vi.fn(async (params: { to: string; subject: string }) => {
      if (state.resendShouldFail) throw new Error('Resend down');
      state.resendCalls.push({ to: params.to, subject: params.subject });
      return { id: 'resend-stub-id' };
    }),
  }));
}

function makeClient() {
  return {
    from: (table: string) => {
      if (table === 'users') return makeUsersChain();
      if (table === 'audit_log') return makeAuditChain();
      return makeUsersChain();
    },
    auth: {
      admin: {
        // P5.x.1-bis : remplace inviteUserByEmail par generateLink
        // (pattern correct : pas d'envoi auto, on envoie via Resend après).
        generateLink: async (params: {
          type: string;
          email: string;
          options?: { data?: Record<string, unknown>; redirectTo?: string };
        }) => {
          state.authInvites.push({ email: params.email, data: params.options?.data });
          if (state.authInviteShouldFail) {
            return { data: null, error: { message: 'Email already registered' } };
          }
          state.lastGenerateLinkOpts = params.options;
          return {
            data: {
              user: { id: state.authInviteUserId },
              properties: {
                action_link: `https://stub.supabase.co/auth/v1/verify?token=stub&redirect_to=${
                  params.options?.redirectTo ?? ''
                }`,
              },
            },
            error: null,
          };
        },
        // P5.x.1-ter — hard delete : supprime auth.users (CASCADE simule public.users).
        deleteUser: async (userId: string) => {
          state.authDeletes.push(userId);
          if (state.authDeleteShouldFail) {
            return { data: null, error: { message: 'Auth delete failed' } };
          }
          // Simule la CASCADE FK : supprime aussi la ligne public.users.
          state.rows = state.rows.filter((r) => r.id !== userId);
          return { data: null, error: null };
        },
      },
    },
  };
}

function makeUsersChain() {
  let filterId: string | null = null;
  let filterEmail: string | null = null;
  let filterRole: string | null = null;
  let filterArchivedNull = false;
  let filterArchivedNotNull = false;
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | null = null;
  let neqId: string | null = null;
  let isHead = false;

  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) isHead = true;
      return chain;
    },
    order: () => chain,
    range: () => chain,
    eq: (col: string, val: unknown) => {
      if (col === 'id') filterId = val as string;
      else if (col === 'email') filterEmail = val as string;
      else if (col === 'role') filterRole = val as string;
      return chain;
    },
    neq: (col: string, val: unknown) => {
      if (col === 'id') neqId = val as string;
      return chain;
    },
    is: (col: string, val: unknown) => {
      if (col === 'archived_at' && val === null) filterArchivedNull = true;
      return chain;
    },
    not: (col: string, op: string) => {
      if (col === 'archived_at' && op === 'is') filterArchivedNotNull = true;
      return chain;
    },
    or: () => chain,
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      return Promise.resolve({ error: null }).then(() => {
        state.rows.push({
          id: (pendingInsert!.id as string) ?? 'new-id',
          email: pendingInsert!.email as string,
          full_name: (pendingInsert!.full_name as string) ?? null,
          role: (pendingInsert!.role as 'admin' | 'sales' | 'super_admin') ?? 'sales',
          totp_enabled: false,
          language: ((pendingInsert!.language as 'fr' | 'en') ?? 'fr') as 'fr' | 'en',
          last_login_at: null,
          archived_at: null,
          created_at: new Date().toISOString(),
        });
        return { error: null };
      });
    },
    upsert: (row: Record<string, unknown>) => {
      // P5.x.1-bis : pattern UPSERT (le trigger on_auth_user_created peut
      // déjà avoir créé la ligne avec role par défaut 'sales').
      const id = row.id as string;
      const idx = state.rows.findIndex((r) => r.id === id);
      if (idx >= 0) {
        state.rows[idx] = { ...state.rows[idx], ...(row as object) } as UserStub;
      } else {
        state.rows.push({
          id,
          email: row.email as string,
          full_name: (row.full_name as string) ?? null,
          role: (row.role as 'admin' | 'sales' | 'super_admin') ?? 'sales',
          totp_enabled: false,
          language: ((row.language as 'fr' | 'en') ?? 'fr') as 'fr' | 'en',
          last_login_at: null,
          archived_at: null,
          created_at: new Date().toISOString(),
        });
      }
      return Promise.resolve({ error: null });
    },
    maybeSingle: () => {
      const rows = applyFilters();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then: (onfulfilled: (v: { data: unknown; count: number; error: null }) => unknown) => {
      const rows = applyFilters();
      if (pendingPatch && filterId) {
        const idx = state.rows.findIndex((r) => r.id === filterId);
        if (idx >= 0) state.rows[idx] = { ...state.rows[idx], ...(pendingPatch as object) };
      }
      const result = isHead
        ? { data: null, count: rows.length, error: null }
        : { data: rows, count: rows.length, error: null };
      return Promise.resolve(result).then(onfulfilled);
    },
  };

  function applyFilters(): UserStub[] {
    let r = [...state.rows];
    if (filterId) r = r.filter((x) => x.id === filterId);
    if (filterEmail) r = r.filter((x) => x.email === filterEmail);
    if (filterRole) r = r.filter((x) => x.role === filterRole);
    if (filterArchivedNull) r = r.filter((x) => x.archived_at === null);
    if (filterArchivedNotNull) r = r.filter((x) => x.archived_at !== null);
    if (neqId) r = r.filter((x) => x.id !== neqId);
    return r;
  }

  return chain;
}

function makeAuditChain() {
  return {
    insert: (row: Record<string, unknown>) => {
      state.audit.push({ row });
      return Promise.resolve({ error: null });
    },
  };
}

function makeUser(p: Partial<UserStub> & { id: string }): UserStub {
  return {
    id: p.id,
    email: p.email ?? 'user@example.com',
    full_name: p.full_name ?? null,
    role: p.role ?? 'sales',
    totp_enabled: false,
    language: p.language ?? 'fr',
    last_login_at: p.last_login_at ?? null,
    archived_at: p.archived_at ?? null,
    created_at: p.created_at ?? '2026-05-20T00:00:00Z',
  };
}

describe('inviteUserAction (P5.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    state.authInvites = [];
    state.authInviteShouldFail = false;
    state.authInviteUserId = 'new-uuid';
    state.resendCalls = [];
    state.resendShouldFail = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('super_admin -> envoie magic link + insère public.users + audit log', async () => {
    mockEnv();
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'new@example.com',
      full_name: 'Jean Dupont',
      role: 'admin',
    });
    expect(r.ok).toBe(true);
    expect(state.authInvites).toHaveLength(1);
    expect(state.authInvites[0].email).toBe('new@example.com');
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].role).toBe('admin');
    expect(state.audit[0].row.entity_type).toBe('users');
    expect((state.audit[0].row.after as { kind: string }).kind).toBe('invited');
  });

  it('email déjà existant en public.users -> ok:false sans appel Auth', async () => {
    mockEnv();
    state.rows = [makeUser({ id: 'x', email: 'dup@example.com' })];
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'dup@example.com',
      full_name: 'X',
      role: 'sales',
    });
    expect(r.ok).toBe(false);
    expect(state.authInvites).toHaveLength(0);
  });

  it('Auth inviteUserByEmail KO -> ok:false', async () => {
    mockEnv();
    state.authInviteShouldFail = true;
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'fresh@example.com',
      full_name: 'X',
      role: 'sales',
    });
    expect(r.ok).toBe(false);
    expect(state.rows).toHaveLength(0);
  });

  it('admin standard -> 403', async () => {
    mockEnv();
    state.adminRole = 'admin';
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'fresh@example.com',
      full_name: 'X',
      role: 'sales',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/);
  });

  // ── P5.x.1-bis : nouveaux tests ──
  it('P5.x.1-bis : envoie un email Resend (pas Brevo) après generateLink', async () => {
    mockEnv();
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'new@example.com',
      full_name: 'Jane Doe',
      role: 'admin',
      language: 'fr',
    });
    expect(r.ok).toBe(true);
    expect(state.resendCalls).toHaveLength(1);
    expect(state.resendCalls[0].to).toBe('new@example.com');
    expect(state.resendCalls[0].subject).toMatch(/invité sur MediaDays/);
  });

  it("P5.x.1-bis : language='en' utilise le subject EN", async () => {
    mockEnv();
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'newen@example.com',
      full_name: 'John Smith',
      role: 'sales',
      language: 'en',
    });
    expect(r.ok).toBe(true);
    expect(state.resendCalls[0].subject).toMatch(/You're invited/);
  });

  it('P5.x.1-bis : language est stockée dans public.users + audit log', async () => {
    mockEnv();
    const { inviteUserAction } = await import('./actions');
    await inviteUserAction({
      email: 'lang@example.com',
      full_name: 'Lang User',
      role: 'sales',
      language: 'en',
    });
    expect(state.rows[0].language).toBe('en');
    expect((state.audit[0].row.after as { language: string }).language).toBe('en');
  });

  it('P5.x.1-bis : Resend KO -> ok:false (le user existe mais email pas envoyé)', async () => {
    mockEnv();
    state.resendShouldFail = true;
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'mail-fail@example.com',
      full_name: 'Fail',
      role: 'sales',
      language: 'fr',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email d'invitation non envoyé/);
  });

  it("P5.x.1-bis : UPSERT n'erreur pas si la ligne existe déjà (trigger on_auth_user_created)", async () => {
    mockEnv();
    // Simule la pré-existence d'une row créée par le trigger DB avec role par défaut.
    const preExisting = makeUser({
      id: 'new-uuid',
      email: 'pre@example.com',
      role: 'sales',
      language: 'fr',
    });
    state.rows = [preExisting];
    state.authInviteUserId = 'new-uuid';
    const { inviteUserAction } = await import('./actions');
    const r = await inviteUserAction({
      email: 'fresh-pre@example.com',
      full_name: 'Pre Existing Override',
      role: 'admin',
      language: 'fr',
    });
    expect(r.ok).toBe(true);
    // Le upsert override le role par défaut 'sales' vers 'admin' choisi par l'admin invitant.
    expect(state.rows.find((r) => r.id === 'new-uuid')?.role).toBe('admin');
  });
});

describe('updateUserRoleAction (P5.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('change role admin -> sales + audit log strict avec before/after', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, email: 'a@b.fr', role: 'admin' })];
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: ADMIN_1,
      new_role: 'sales',
      reason: 'Réorganisation équipe',
    });
    expect(r.ok).toBe(true);
    expect(state.rows[0].role).toBe('sales');
    expect((state.audit[0].row.before as { role: string }).role).toBe('admin');
    expect((state.audit[0].row.after as { role: string; reason: string }).role).toBe('sales');
    expect((state.audit[0].row.after as { reason: string }).reason).toBe('Réorganisation équipe');
  });

  it('downgrade DU dernier super_admin -> ok:false (garde-fou code)', async () => {
    mockEnv();
    state.rows = [makeUser({ id: SUPER_1, email: 's@b.fr', role: 'super_admin' })];
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: SUPER_1,
      new_role: 'admin',
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dernier super_admin/);
    expect(state.rows[0].role).toBe('super_admin');
  });

  it("downgrade super_admin OK s'il en reste 1 autre actif", async () => {
    mockEnv();
    state.rows = [
      makeUser({ id: SUPER_1, email: 's1@b.fr', role: 'super_admin' }),
      makeUser({ id: SUPER_2, email: 's2@b.fr', role: 'super_admin' }),
    ];
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: SUPER_1,
      new_role: 'admin',
      reason: 'Reorg',
    });
    expect(r.ok).toBe(true);
  });

  it('user archivé -> ok:false', async () => {
    mockEnv();
    state.rows = [
      makeUser({
        id: ADMIN_1,
        email: 'a@b.fr',
        role: 'admin',
        archived_at: '2026-05-01T00:00:00Z',
      }),
    ];
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: ADMIN_1,
      new_role: 'sales',
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
  });

  it('même rôle -> ok:false (no-op)', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, role: 'admin' })];
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: ADMIN_1,
      new_role: 'admin',
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
  });

  it('admin standard -> 403', async () => {
    mockEnv();
    state.adminRole = 'admin';
    const { updateUserRoleAction } = await import('./actions');
    const r = await updateUserRoleAction({
      user_id: ADMIN_1,
      new_role: 'sales',
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
  });
});

describe('archiveUserAction (P5.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('soft delete + audit log avec reason', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, role: 'admin' })];
    const { archiveUserAction } = await import('./actions');
    const r = await archiveUserAction({
      user_id: ADMIN_1,
      reason: 'Départ équipe',
    });
    expect(r.ok).toBe(true);
    expect(state.rows[0].archived_at).not.toBeNull();
    expect((state.audit[0].row.after as { reason: string }).reason).toBe('Départ équipe');
  });

  it('archive DU dernier super_admin -> ok:false', async () => {
    mockEnv();
    state.rows = [makeUser({ id: SUPER_1, role: 'super_admin' })];
    const { archiveUserAction } = await import('./actions');
    const r = await archiveUserAction({
      user_id: SUPER_1,
      reason: 'Test',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dernier super_admin/);
  });

  it('admin standard -> 403', async () => {
    mockEnv();
    state.adminRole = 'admin';
    const { archiveUserAction } = await import('./actions');
    const r = await archiveUserAction({
      user_id: ADMIN_1,
      reason: 'Test reason',
    });
    expect(r.ok).toBe(false);
  });
});

describe('unarchiveUserAction (P5.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("reset archived_at + audit log kind='unarchived'", async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, archived_at: '2026-05-01T00:00:00Z' })];
    const { unarchiveUserAction } = await import('./actions');
    const r = await unarchiveUserAction({ user_id: ADMIN_1 });
    expect(r.ok).toBe(true);
    expect(state.rows[0].archived_at).toBeNull();
    expect((state.audit[0].row.after as { kind: string }).kind).toBe('unarchived');
  });

  it('user déjà actif -> ok:false', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1 })];
    const { unarchiveUserAction } = await import('./actions');
    const r = await unarchiveUserAction({ user_id: ADMIN_1 });
    expect(r.ok).toBe(false);
  });
});

describe('resendInviteAction (P5.x.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    state.authInvites = [];
    state.authInviteShouldFail = false;
    state.resendCalls = [];
    state.resendShouldFail = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('user jamais connecté -> re-déclenche magic link + audit log', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, email: 'nb@example.com', last_login_at: null })];
    const { resendInviteAction } = await import('./actions');
    const r = await resendInviteAction({ user_id: ADMIN_1 });
    expect(r.ok).toBe(true);
    expect(state.authInvites).toHaveLength(1);
    expect(state.authInvites[0].email).toBe('nb@example.com');
    expect((state.audit[0].row.after as { kind: string }).kind).toBe('invite_resent');
  });

  it('user déjà connecté -> ok:false (pas besoin)', async () => {
    mockEnv();
    state.rows = [
      makeUser({ id: ADMIN_1, email: 'x@x.fr', last_login_at: '2026-05-10T00:00:00Z' }),
    ];
    const { resendInviteAction } = await import('./actions');
    const r = await resendInviteAction({ user_id: ADMIN_1 });
    expect(r.ok).toBe(false);
    expect(state.authInvites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P5.x.1-ter — redirectTo setup-password (sanity check sur generateLink opts)
// ---------------------------------------------------------------------------

describe('inviteUserAction redirectTo (P5.x.1-ter)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    state.authInvites = [];
    state.resendCalls = [];
    state.lastGenerateLinkOpts = undefined;
    state.authInviteUserId = 'new-redir-uuid';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('P5.x.1-ter : redirectTo pointe vers /auth/setup-password (pas /admin direct)', async () => {
    mockEnv();
    const { inviteUserAction } = await import('./actions');
    await inviteUserAction({
      email: 'redir@example.com',
      full_name: 'Redir User',
      role: 'admin',
      language: 'fr',
    });
    expect(state.lastGenerateLinkOpts?.redirectTo).toMatch(/\/auth\/setup-password$/);
  });
});

// ---------------------------------------------------------------------------
// P5.x.1-ter — hardDeleteUserAction
// ---------------------------------------------------------------------------

describe('hardDeleteUserAction (P5.x.1-ter)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.adminRole = 'super_admin';
    state.rows = [];
    state.audit = [];
    state.authDeletes = [];
    state.authDeleteShouldFail = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('admin standard -> 403 (super_admin only)', async () => {
    mockEnv();
    state.adminRole = 'admin';
    state.rows = [makeUser({ id: ADMIN_1, email: 'a@b.fr', role: 'admin' })];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'compte de test à nettoyer',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/);
    expect(state.authDeletes).toHaveLength(0);
  });

  it("confirmation != 'SUPPRIMER' -> ok:false validation", async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1, email: 'a@b.fr', role: 'admin' })];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'compte de test',
      // @ts-expect-error : Zod refuse, on teste exactement cette erreur.
      confirmation: 'DELETE',
    });
    expect(r.ok).toBe(false);
    expect(state.authDeletes).toHaveLength(0);
  });

  it('reason < 10 chars -> ok:false validation', async () => {
    mockEnv();
    state.rows = [makeUser({ id: ADMIN_1 })];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'court',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    expect(state.authDeletes).toHaveLength(0);
  });

  it('self-delete bloqué', async () => {
    mockEnv();
    // L'actor super_admin a id='a0000000-0000-4000-8000-000000000001' (cf. mock requireSuperAdmin).
    state.rows = [makeUser({ id: 'a0000000-0000-4000-8000-000000000001', role: 'super_admin' })];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: 'a0000000-0000-4000-8000-000000000001',
      reason: 'tentative self-destruction',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/propre compte/);
  });

  it('dernier super_admin -> ok:false (garde-fou)', async () => {
    mockEnv();
    state.rows = [makeUser({ id: SUPER_1, role: 'super_admin' })];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: SUPER_1,
      reason: 'tentative suppression dernier super',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dernier super_admin/);
  });

  it('happy path : audit log AVANT delete + CASCADE supprime public.users', async () => {
    mockEnv();
    state.rows = [
      makeUser({ id: ADMIN_1, email: 'tobedel@example.com', role: 'admin' }),
      makeUser({ id: SUPER_1, role: 'super_admin' }),
    ];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'compte de test à nettoyer',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(true);
    expect(state.authDeletes).toEqual([ADMIN_1]);
    // CASCADE simulée : la row public.users est retirée.
    expect(state.rows.find((r) => r.id === ADMIN_1)).toBeUndefined();
    // Audit log capture before complet (email + role).
    expect(state.audit[0].row.action).toBe('delete');
    expect((state.audit[0].row.before as { email: string }).email).toBe('tobedel@example.com');
    expect((state.audit[0].row.before as { role: string }).role).toBe('admin');
    expect((state.audit[0].row.after as { reason: string }).reason).toBe(
      'compte de test à nettoyer',
    );
  });

  it("super_admin OK s'il en reste un autre actif", async () => {
    mockEnv();
    state.rows = [
      makeUser({ id: SUPER_1, role: 'super_admin' }),
      makeUser({ id: SUPER_2, role: 'super_admin' }),
    ];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: SUPER_1,
      reason: 'reorganisation équipe top',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(true);
  });

  it('Auth deleteUser KO -> ok:false avec message Supabase', async () => {
    mockEnv();
    state.authDeleteShouldFail = true;
    state.rows = [
      makeUser({ id: ADMIN_1, role: 'admin' }),
      makeUser({ id: SUPER_1, role: 'super_admin' }),
    ];
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'compte de test à nettoyer',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Auth delete failed/);
  });

  it('user_id introuvable -> ok:false', async () => {
    mockEnv();
    const { hardDeleteUserAction } = await import('./actions');
    const r = await hardDeleteUserAction({
      user_id: ADMIN_1,
      reason: 'compte introuvable test',
      confirmation: 'SUPPRIMER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/introuvable/);
  });
});
