/**
 * @vitest-environment node
 *
 * P5.x.CompanyEditAddressSave — updateCompanyAction persiste les coordonnées
 * postales saisies manuellement (raw_address, city, postal_code, state,
 * website, phone) + audit log.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  role: string;
  before: Record<string, unknown> | null;
  duplicate: { id: string; name: string } | null;
  updatePatch: Record<string, unknown> | null;
  updateError: { message: string } | null;
  audits: Array<Record<string, unknown>>;
}

const state: MockState = {
  role: 'admin',
  before: null,
  duplicate: null,
  updatePatch: null,
  updateError: null,
  audits: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: state.role, email: 'a@b' }),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (role: string) => role === 'admin' || role === 'super_admin',
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));

  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () =>
      Promise.resolve({
        from(table: string) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b: any = { _table: table, _cols: '' };
          b.select = (cols: string) => {
            b._cols = cols ?? '';
            return b;
          };
          b.eq = () => b;
          b.neq = () => b;
          b.ilike = () => b;
          b.maybeSingle = () => {
            if (table === 'poles') return Promise.resolve({ data: { id: 'pole-1' }, error: null });
            if (table === 'companies') {
              if (b._cols.includes('raw_address')) {
                return Promise.resolve({ data: state.before, error: null });
              }
              return Promise.resolve({ data: state.duplicate, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          };
          b.update = (patch: Record<string, unknown>) => {
            state.updatePatch = patch;
            return { eq: () => Promise.resolve({ error: state.updateError }) };
          };
          b.insert = (row: Record<string, unknown>) => {
            state.audits.push(row);
            return Promise.resolve({ error: null });
          };
          return b;
        },
      }),
  }));
}

const COMPANY_ID = '92d51b10-7085-4695-b257-72c61d01917a';

/** Construit un FormData. Une clé absente de `fields` = non soumise (undefined). */
function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  f.set('company_id', COMPANY_ID);
  f.set('name', 'CreaCast');
  f.set('category', 'standard');
  f.set('pole_code', 'AUDIO_RADIO');
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe('updateCompanyAction — coordonnées postales (P5.x.CompanyEditAddressSave)', () => {
  beforeEach(() => {
    state.role = 'admin';
    state.before = {
      name: 'CreaCast',
      primary_domain: null,
      country: 'FR',
      category: 'standard',
      raw_address: null,
      city: null,
      postal_code: null,
      state: 'Île-de-France',
      website: null,
      phone: null,
    };
    state.duplicate = null;
    state.updatePatch = null;
    state.updateError = null;
    state.audits = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('raw_address renseignée → persistée dans le UPDATE', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction({}, fd({ raw_address: '58 avenue de Wagram' }));
    expect(state.updatePatch?.raw_address).toBe('58 avenue de Wagram');
  });

  it('raw_address vide "" → UPDATE avec NULL (efface)', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction({}, fd({ raw_address: '' }));
    expect(state.updatePatch).not.toBeNull();
    expect(state.updatePatch).toHaveProperty('raw_address', null);
  });

  it('raw_address non soumise (undefined) → colonne non touchée', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction({}, fd({ city: 'Paris' }));
    expect(state.updatePatch).not.toHaveProperty('raw_address');
    // city soumise → bien présente
    expect(state.updatePatch?.city).toBe('Paris');
  });

  it('state non rendu par le form → jamais écrasé (pas dans le patch)', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction({}, fd({ raw_address: 'X', city: 'Y', postal_code: '75001' }));
    expect(state.updatePatch).not.toHaveProperty('state');
  });

  it('tous les champs adresse acceptés (schema) + persistés', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction(
      {},
      fd({
        raw_address: '4 rue Blaise Pascal',
        city: 'Boulogne',
        postal_code: '92100',
        website: 'https://creacast.com',
        phone: '+33 1 23 45 67 89',
      }),
    );
    expect(state.updatePatch).toMatchObject({
      raw_address: '4 rue Blaise Pascal',
      city: 'Boulogne',
      postal_code: '92100',
      website: 'https://creacast.com',
      phone: '+33 1 23 45 67 89',
    });
  });

  it('audit log : entry company_updated avec diff before/after sur l’adresse', async () => {
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    await updateCompanyAction(
      {},
      fd({ raw_address: 'Nouvelle adresse 123', postal_code: '99999' }),
    );
    expect(state.audits).toHaveLength(1);
    const a = state.audits[0];
    expect(a.entity_type).toBe('companies');
    expect(a.action).toBe('update');
    expect((a.after as Record<string, unknown>).kind).toBe('company_updated');
    expect((a.after as Record<string, unknown>).raw_address).toBe('Nouvelle adresse 123');
    expect((a.before as Record<string, unknown>).raw_address).toBeNull();
    expect((a.after as Record<string, unknown>).postal_code).toBe('99999');
  });

  it('refuse si role non-admin', async () => {
    state.role = 'sales';
    mockEnv();
    const { updateCompanyAction } = await import('./actions');
    const r = await updateCompanyAction({}, fd({ raw_address: 'X' }));
    expect(r?.error).toBeDefined();
    expect(state.updatePatch).toBeNull();
  });
});
