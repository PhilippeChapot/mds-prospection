/**
 * @vitest-environment node
 *
 * P15.1.VisitorModel — tests createVisitorAction.
 *
 * Couvre :
 *   - contact_id existant → succès (pas d'insert contact)
 *   - new_contact dont l'email existe déjà → réutilise le contact
 *   - new_contact totalement nouveau + société → crée company + contact
 *   - contact déjà visiteur → throw
 *   - ni contact_id ni new_contact → throw (Zod)
 *   - RBAC : requireAdminProfile rejette → action rejette
 *   - audit_log : kind 'visitor_created'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PROFILE_ID = 'bb000000-0000-0000-0000-000000000002';
const CONTACT_ID = 'cc000000-0000-4000-8000-000000000003';

type Scenario = {
  contactByEmail: { id: string; company_id: string | null } | null;
  companyByName: { id: string } | null;
  existingVisitor: { id: string } | null;
  contactCompany: { company_id: string | null } | null;
  adminThrows: boolean;
};

const scenario: Scenario = {
  contactByEmail: null,
  companyByName: null,
  existingVisitor: null,
  contactCompany: { company_id: 'co-existing' },
  adminThrows: false,
};

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

function reset() {
  scenario.contactByEmail = null;
  scenario.companyByName = null;
  scenario.existingVisitor = null;
  scenario.contactCompany = { company_id: 'co-existing' };
  scenario.adminThrows = false;
  inserts.length = 0;
}

function insertId(table: string): string {
  return { companies: 'co-new', contacts: 'ct-new', visitors: 'v-new' }[table] ?? 'new-id';
}

function makeBuilder(table: string) {
  const filters: Record<string, unknown> = {};
  let insertRow: Record<string, unknown> | null = null;

  const handleTerminal = (): { data: unknown; error: null } => {
    if (insertRow) {
      return { data: { id: insertId(table) }, error: null };
    }
    if (table === 'visitors') return { data: scenario.existingVisitor, error: null };
    if (table === 'companies') return { data: scenario.companyByName, error: null };
    if (table === 'contacts') {
      if ('email' in filters) return { data: scenario.contactByEmail, error: null };
      return { data: scenario.contactCompany, error: null };
    }
    return { data: null, error: null };
  };

  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      inserts.push({ table, row });
      return builder;
    },
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    ilike(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(handleTerminal());
    },
    single() {
      return Promise.resolve(handleTerminal());
    },
    // Thenable so `await supabase.from('audit_log').insert({...})` resolves.
    then(resolve: (r: { error: null }) => unknown) {
      return Promise.resolve(resolve({ error: null }));
    },
  };
  return builder;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (scenario.adminThrows) throw new Error('FORBIDDEN');
      return { id: PROFILE_ID, email: 'admin@mds.fr', full_name: 'Admin', role: 'admin' as const };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeBuilder(t) }),
  }));
}

async function loadAction() {
  mockEnv();
  return (await import('./create-actions')).createVisitorAction;
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('createVisitorAction (P15.1)', () => {
  it('contact_id existant → succès, aucun insert contact/company', async () => {
    const createVisitorAction = await loadAction();
    const res = await createVisitorAction({ contact_id: CONTACT_ID, status: 'lead' });
    expect(res.success).toBe(true);
    expect(res.visitor_id).toBe('v-new');
    expect(inserts.find((i) => i.table === 'contacts')).toBeUndefined();
    expect(inserts.find((i) => i.table === 'companies')).toBeUndefined();
    expect(inserts.find((i) => i.table === 'visitors')).toBeDefined();
  });

  it("new_contact dont l'email existe déjà → réutilise le contact (pas d'insert contact)", async () => {
    scenario.contactByEmail = { id: 'ct-existing', company_id: 'co-x' };
    const createVisitorAction = await loadAction();
    const res = await createVisitorAction({
      new_contact: { first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.com' },
    });
    expect(res.success).toBe(true);
    expect(inserts.find((i) => i.table === 'contacts')).toBeUndefined();
    const visitorInsert = inserts.find((i) => i.table === 'visitors');
    expect(visitorInsert?.row.contact_id).toBe('ct-existing');
  });

  it('new_contact totalement nouveau + société → crée company + contact + visitor', async () => {
    const createVisitorAction = await loadAction();
    const res = await createVisitorAction({
      new_contact: {
        first_name: 'New',
        last_name: 'Guy',
        email: 'new@startup.io',
        new_company_name: 'Startup IO',
      },
    });
    expect(res.success).toBe(true);
    expect(inserts.find((i) => i.table === 'companies')).toBeDefined();
    expect(inserts.find((i) => i.table === 'contacts')).toBeDefined();
    expect(inserts.find((i) => i.table === 'visitors')).toBeDefined();
  });

  it('contact déjà visiteur → throw', async () => {
    scenario.existingVisitor = { id: 'v-existing' };
    const createVisitorAction = await loadAction();
    await expect(createVisitorAction({ contact_id: CONTACT_ID })).rejects.toThrow(
      /déjà enregistré/,
    );
  });

  it('ni contact_id ni new_contact → throw (validation)', async () => {
    const createVisitorAction = await loadAction();
    await expect(createVisitorAction({})).rejects.toThrow();
  });

  it('RBAC : requireAdminProfile rejette → action rejette', async () => {
    scenario.adminThrows = true;
    const createVisitorAction = await loadAction();
    await expect(createVisitorAction({ contact_id: CONTACT_ID })).rejects.toThrow('FORBIDDEN');
  });

  it("audit_log : enregistre une entrée kind 'visitor_created'", async () => {
    const createVisitorAction = await loadAction();
    await createVisitorAction({ contact_id: CONTACT_ID });
    const audit = inserts.find((i) => i.table === 'audit_log');
    expect(audit).toBeDefined();
    expect(audit?.row.action).toBe('create');
    expect((audit?.row.after as Record<string, unknown>).kind).toBe('visitor_created');
  });
});
