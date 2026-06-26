/**
 * @vitest-environment node
 *
 * P5.x.ReassignContactsToCompany — server action reassignContactsToCompanyAction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  role: string;
  target: { id: string; name: string; primary_domain: string | null } | null;
  contacts: Array<{ id: string; email: string | null; company_id: string }>;
  rpcResult: unknown;
  rpcError: { message: string } | null;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
}

const state: MockState = {
  role: 'admin',
  target: null,
  contacts: [],
  rpcResult: { moved_contacts: 1, moved_prospects: 1, target_name: 'Prisma Media' },
  rpcError: null,
  rpcCalls: [],
};

const TARGET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () => Promise.resolve({ id: 'admin-1', role: state.role, email: 'a@b' }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (role: string) => role === 'admin' || role === 'super_admin',
  }));
  vi.doMock('@/lib/admin/search/fuzzy-search', () => ({
    searchCompaniesFuzzy: vi.fn().mockResolvedValue({ exact: [], suggestions: [], query: '' }),
  }));

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = () =>
          Promise.resolve({ data: table === 'companies' ? state.target : null, error: null });
        builder.in = () =>
          Promise.resolve({
            data: table === 'contacts' ? state.contacts : [],
            error: null,
          });
        return builder;
      },
      rpc: (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args });
        return Promise.resolve({ data: state.rpcResult, error: state.rpcError });
      },
    }),
  }));
}

describe('reassignContactsToCompanyAction', () => {
  beforeEach(() => {
    state.role = 'admin';
    state.target = { id: TARGET_ID, name: 'Prisma Media', primary_domain: 'prismamedia.com' };
    state.contacts = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'jean@prismamedia.com',
        company_id: 'src-1',
      },
    ];
    state.rpcResult = { moved_contacts: 1, moved_prospects: 1, target_name: 'Prisma Media' };
    state.rpcError = null;
    state.rpcCalls = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse si role non-admin (sales)', async () => {
    state.role = 'sales';
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('happy path : 1 contact → RPC appelée + counts retournés', async () => {
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moved_contacts).toBe(1);
      expect(r.moved_prospects).toBe(1);
      expect(r.target_name).toBe('Prisma Media');
    }
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('reassign_contacts_to_company');
    expect(state.rpcCalls[0].args.p_target_company_id).toBe(TARGET_ID);
    expect(state.rpcCalls[0].args.p_contact_ids).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('domain mismatch sans force → erreur domain_mismatch + details, pas de RPC', async () => {
    state.contacts = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'gilles@creacast.com',
        company_id: 'src-1',
      },
    ];
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('domain_mismatch');
      expect(r.mismatches).toHaveLength(1);
      expect(r.mismatches?.[0].contact_domain).toBe('creacast.com');
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('domain mismatch avec force=true → RPC appelée (succès)', async () => {
    state.contacts = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'gilles@creacast.com',
        company_id: 'src-1',
      },
    ];
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
      force_domain_mismatch: true,
    });
    expect(r.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('skip no-op : contact déjà sur la cible → erreur, pas de RPC', async () => {
    state.contacts = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'jean@prismamedia.com',
        company_id: TARGET_ID,
      },
    ];
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('cible introuvable → erreur, pas de RPC', async () => {
    state.target = null;
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('email perso (gmail) ≠ domaine cible → PAS de mismatch, RPC appelée', async () => {
    state.contacts = [
      { id: '11111111-1111-4111-8111-111111111111', email: 'eric@gmail.com', company_id: 'src-1' },
    ];
    mockEnv();
    const { reassignContactsToCompanyAction } = await import('./contact-reassign-actions');
    const r = await reassignContactsToCompanyAction({
      contact_ids: ['11111111-1111-4111-8111-111111111111'],
      target_company_id: TARGET_ID,
    });
    expect(r.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
  });
});
