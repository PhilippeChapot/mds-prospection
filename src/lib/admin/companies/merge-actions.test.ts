/**
 * @vitest-environment node
 *
 * P5.x.CompanyMerge — tests server actions merge / preview / RBAC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;

const state = {
  // RBAC : si superAdmin=false → requireSuperAdmin throw.
  superAdmin: true,
  profileId: 'super-1',
  // Lignes companies par id (source/target).
  companies: {} as Record<string, Row | null>,
  // Counts par table pour previewMergeImpactAction.
  counts: {} as Record<string, number>,
  // Réponse de la RPC merge_companies.
  rpc: { data: null as unknown, error: null as { message: string } | null },
  rpcCalls: [] as Array<{ fn: string; args: Row }>,
};

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireSuperAdmin: vi.fn(async () => {
      if (!state.superAdmin) throw new Error('Réservé aux super_admin.');
      return { id: state.profileId, email: 's@a.fr', full_name: null, role: 'super_admin' };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/admin/search/fuzzy-search', () => ({
    searchCompaniesFuzzy: vi.fn(async () => ({
      exact: [{ id: 'win-group', label: 'Win-Group Software SAS', score: 1 }],
      suggestions: [{ id: 'winmedia', label: 'WinMedia', score: 0.6 }],
      query: 'win',
    })),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      rpc: async (fn: string, args: Row) => {
        state.rpcCalls.push({ fn, args });
        return state.rpc;
      },
      from(table: string) {
        const ctx = { isCount: false, eqId: null as string | null };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: (_cols: string, options?: { head?: boolean }) => {
            ctx.isCount = !!options?.head;
            return chain;
          },
          eq: (_col: string, val: string) => {
            ctx.eqId = val;
            return chain;
          },
          maybeSingle: async () => ({ data: state.companies[ctx.eqId ?? ''] ?? null }),
          // Thenable : utilisé par les count queries (await direct).
          then: (resolve: (v: { count: number }) => unknown) =>
            resolve({ count: state.counts[table] ?? 0 }),
        };
        return chain;
      },
    }),
  }));
}

function reset() {
  state.superAdmin = true;
  state.profileId = 'super-1';
  state.companies = {};
  state.counts = {};
  state.rpc = { data: null, error: null };
  state.rpcCalls = [];
}

describe('mergeCompaniesAction (P5.x.CompanyMerge)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  const SRC = '11111111-1111-4111-8111-111111111111';
  const TGT = '22222222-2222-4222-8222-222222222222';

  it('Merge basique : appelle la RPC merge_companies avec p_actor_id et retourne les counts', async () => {
    state.rpc = {
      data: { prospects: 3, contacts: 5, source_name: 'WinMedia', target_name: 'Win-Group' },
      error: null,
    };
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: TGT,
      confirmation: 'FUSIONNER',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.target_name).toBe('Win-Group');
      expect(r.data.moved.prospects).toBe(3);
      expect(r.data.moved.contacts).toBe(5);
    }
    // RPC appelée une fois avec les bons paramètres (dont l'acteur pour l'audit).
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('merge_companies');
    expect(state.rpcCalls[0].args.p_source_id).toBe(SRC);
    expect(state.rpcCalls[0].args.p_target_id).toBe(TGT);
  });

  it('Audit log : la RPC reçoit p_actor_id = id du super_admin courant', async () => {
    state.profileId = 'super-XYZ';
    state.rpc = { data: { source_name: 'A', target_name: 'B' }, error: null };
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: TGT,
      confirmation: 'FUSIONNER',
    });
    expect(r.ok).toBe(true);
    // L'attribution de l'audit (écrit dans la RPC) dépend de p_actor_id.
    expect(state.rpcCalls[0].args.p_actor_id).toBe('super-XYZ');
  });

  it('RBAC : un non-super_admin (sales) est refusé, la RPC n’est jamais appelée', async () => {
    state.superAdmin = false;
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: TGT,
      confirmation: 'FUSIONNER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/super_admin/i);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('Atomicité : une erreur RPC (rollback Postgres) remonte en ok:false', async () => {
    state.rpc = { data: null, error: { message: 'TARGET_NOT_FOUND' } };
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: TGT,
      confirmation: 'FUSIONNER',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cible introuvable/i);
  });

  it('Garde-fou : source === target refusé avant tout appel RPC', async () => {
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: SRC,
      confirmation: 'FUSIONNER',
    });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('Confirmation invalide (Zod literal "FUSIONNER") → ok:false sans RPC', async () => {
    mockEnv();
    const { mergeCompaniesAction } = await import('./merge-actions');
    const r = await mergeCompaniesAction({
      source_id: SRC,
      target_id: TGT,
      // @ts-expect-error test du rejet Zod sur la mauvaise valeur
      confirmation: 'oui',
    });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe('previewMergeImpactAction (P5.x.CompanyMerge)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  const SRC = '11111111-1111-4111-8111-111111111111';
  const TGT = '22222222-2222-4222-8222-222222222222';

  it('sellsy_id backfill : cible sans sellsy_id + source avec → sellsy_backfill=true + counts', async () => {
    state.companies[SRC] = { id: SRC, name: 'WinMedia', sellsy_id: '52457', siren: '111111111' };
    state.companies[TGT] = {
      id: TGT,
      name: 'Win-Group Software SAS',
      sellsy_id: null,
      siren: null,
    };
    state.counts = {
      prospects: 4,
      contacts: 7,
      reminders: 2,
      affiliate_claims: 1,
    };
    mockEnv();
    const { previewMergeImpactAction } = await import('./merge-actions');
    const r = await previewMergeImpactAction({ source_id: SRC, target_id: TGT });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sellsy_backfill).toBe(true);
      expect(r.data.siren_backfill).toBe(true);
      expect(r.data.counts.prospects).toBe(4);
      expect(r.data.counts.contacts).toBe(7);
      expect(r.data.source.name).toBe('WinMedia');
      expect(r.data.target.name).toBe('Win-Group Software SAS');
    }
  });

  it('Pas de backfill si la cible a déjà un sellsy_id', async () => {
    state.companies[SRC] = { id: SRC, name: 'WinMedia', sellsy_id: '52457', siren: null };
    state.companies[TGT] = { id: TGT, name: 'Win-Group', sellsy_id: '99999', siren: null };
    mockEnv();
    const { previewMergeImpactAction } = await import('./merge-actions');
    const r = await previewMergeImpactAction({ source_id: SRC, target_id: TGT });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.sellsy_backfill).toBe(false);
  });

  it('RBAC : non-super_admin refusé', async () => {
    state.superAdmin = false;
    mockEnv();
    const { previewMergeImpactAction } = await import('./merge-actions');
    const r = await previewMergeImpactAction({ source_id: SRC, target_id: TGT });
    expect(r.ok).toBe(false);
  });
});

describe('searchMergeTargetsAction (P5.x.CompanyMerge)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
  });
  afterEach(() => vi.restoreAllMocks());

  const SRC = '11111111-1111-4111-8111-111111111111';

  it('Exclut la source des résultats et mappe {id,name}', async () => {
    mockEnv();
    const { searchMergeTargetsAction } = await import('./merge-actions');
    const r = await searchMergeTargetsAction({ q: 'win', exclude_id: SRC });
    expect(r.some((c) => c.name === 'Win-Group Software SAS')).toBe(true);
    expect(r.some((c) => c.name === 'WinMedia')).toBe(true);
    // Aucun résultat ne doit porter l'id de la source.
    expect(r.some((c) => c.id === SRC)).toBe(false);
  });
});
