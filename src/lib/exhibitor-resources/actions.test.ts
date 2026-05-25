/**
 * @vitest-environment node
 *
 * P3.1 — tests server actions exhibitor-resources.
 *
 * Couvre :
 *   - listResourcesAction : tri + reject non-admin
 *   - getPublishedResourcesAction : filtrage is_published + projection locale
 *   - upsertResourceAction : create (insert + audit), update (preserve before),
 *     slug invalide (Zod), slug collision (autre id), reject non-admin
 *   - deleteResourceAction : delete + audit log strict, reject non-admin
 *   - assertUniqueSlug : isolé OK + collision
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const RES_ID = '11111111-1111-4111-8111-111111111111';
const RES_ID_2 = '22222222-2222-4222-8222-222222222222';

interface MockState {
  adminRole: 'admin' | 'sales' | 'super_admin' | null;
  rows: Array<{
    id: string;
    slug: string;
    title_fr: string;
    title_en: string;
    body_fr: string | null;
    body_en: string | null;
    is_published: boolean;
    display_order: number;
    updated_at: string;
    updated_by_user_id: string | null;
    created_at: string;
  }>;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown>; id: string }>;
  deletes: Array<{ table: string; id: string }>;
}

const state: MockState = {
  adminRole: 'admin',
  rows: [],
  inserts: [],
  updates: [],
  deletes: [],
};

function reset() {
  state.adminRole = 'admin';
  state.rows = [];
  state.inserts.length = 0;
  state.updates.length = 0;
  state.deletes.length = 0;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => {
      if (!state.adminRole) throw new Error('redirect');
      return { id: 'u-admin', email: 'a@b', full_name: null, role: state.adminRole };
    }),
    requireSuperAdmin: vi.fn(async () => {
      if (state.adminRole !== 'super_admin') throw new Error('Réservé aux super_admin.');
      return { id: 'u-super', email: 's@b', full_name: null, role: 'super_admin' as const };
    }),
  }));
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => makeFakeClient(),
  }));
}

function makeFakeClient() {
  return {
    from: (table: string) => makeChain(table),
  };
}

function makeChain(table: string) {
  let filterId: string | null = null;
  let filterSlug: string | null = null;
  let filterPublished: boolean | null = null;
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsertRow: Record<string, unknown> | null = null;
  let isDelete = false;

  const chain: Record<string, unknown> = {};

  const projectRow = (r: MockState['rows'][number]) => r;

  const buildResult = () => {
    let data = state.rows.slice();
    if (filterId) data = data.filter((r) => r.id === filterId);
    if (filterSlug) data = data.filter((r) => r.slug === filterSlug);
    if (filterPublished !== null) data = data.filter((r) => r.is_published === filterPublished);
    return data.map(projectRow);
  };

  Object.assign(chain, {
    select: () => chain,
    order: () => chain,
    eq: (col: string, val: unknown) => {
      if (col === 'id') filterId = val as string;
      if (col === 'slug') filterSlug = val as string;
      if (col === 'is_published') filterPublished = val as boolean;
      return chain;
    },
    maybeSingle: () => {
      const rows = buildResult();
      if (isDelete) {
        const ids = rows.map((r) => r.id);
        state.rows = state.rows.filter((r) => !ids.includes(r.id));
        state.deletes.push({ table, id: filterId ?? '' });
        return Promise.resolve({ data: { id: filterId }, error: null });
      }
      if (pendingPatch) {
        const id = filterId;
        if (!id) return Promise.resolve({ data: null, error: { message: 'no id' } });
        state.rows = state.rows.map((r) =>
          r.id === id ? ({ ...r, ...(pendingPatch as object) } as MockState['rows'][number]) : r,
        );
        state.updates.push({ table, patch: pendingPatch, id });
        return Promise.resolve({ data: { id }, error: null });
      }
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    single: () => {
      if (pendingInsertRow) {
        const inserted = {
          id: (pendingInsertRow.id as string) ?? RES_ID,
          slug: pendingInsertRow.slug as string,
          title_fr: pendingInsertRow.title_fr as string,
          title_en: pendingInsertRow.title_en as string,
          body_fr: (pendingInsertRow.body_fr as string) ?? null,
          body_en: (pendingInsertRow.body_en as string) ?? null,
          is_published: pendingInsertRow.is_published as boolean,
          display_order: pendingInsertRow.display_order as number,
          updated_at: (pendingInsertRow.updated_at as string) ?? new Date().toISOString(),
          updated_by_user_id: (pendingInsertRow.updated_by_user_id as string) ?? null,
          created_at: new Date().toISOString(),
        };
        state.rows.push(inserted);
        state.inserts.push({ table, row: pendingInsertRow });
        return Promise.resolve({ data: { id: inserted.id }, error: null });
      }
      const rows = buildResult();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      // Audit log : on enregistre l'insert mais on n'a pas besoin de
      // chaîner ensuite (le code utilise `await supabase.from('audit_log').insert(...)`)
      if (table === 'audit_log') {
        state.inserts.push({ table, row });
        // L'insert audit_log retourne une thenable directe.
        return Promise.resolve({ data: null, error: null });
      }
      pendingInsertRow = row;
      return chain;
    },
    delete: () => {
      isDelete = true;
      return chain;
    },
    then: (onfulfilled: (v: { data: unknown; error: null }) => unknown) => {
      // Utilisé par `.delete().eq(...)` (await direct) et `.select().eq(...)`
      // sans .maybeSingle (assertUniqueSlug fait `await query` après filtrage).
      if (isDelete) {
        const rows = buildResult();
        const ids = rows.map((r) => r.id);
        state.rows = state.rows.filter((r) => !ids.includes(r.id));
        state.deletes.push({ table, id: filterId ?? '' });
        return Promise.resolve({ data: null, error: null }).then(onfulfilled);
      }
      const rows = buildResult();
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
    },
  });

  return chain;
}

function seed(rows: Partial<MockState['rows'][number]>[] = []) {
  state.rows = rows.map((r, idx) => ({
    id: r.id ?? `id-${idx}`,
    slug: r.slug ?? `slug-${idx}`,
    title_fr: r.title_fr ?? 'Titre FR',
    title_en: r.title_en ?? 'Title EN',
    body_fr: r.body_fr ?? 'Contenu FR markdown valide ici.',
    body_en: r.body_en ?? 'Content EN markdown valid here.',
    is_published: r.is_published ?? true,
    display_order: r.display_order ?? idx * 10,
    updated_at: r.updated_at ?? '2026-05-25T10:00:00Z',
    updated_by_user_id: r.updated_by_user_id ?? null,
    created_at: r.created_at ?? '2026-05-25T09:00:00Z',
  }));
}

describe('exhibitor-resources actions (P3.1)', () => {
  beforeEach(() => {
    vi.resetModules();
    reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  // -------------------------------------------------------------------------
  // listResourcesAction
  // -------------------------------------------------------------------------

  describe('listResourcesAction', () => {
    it('admin -> retourne toutes les ressources', async () => {
      mockEnv();
      seed([
        { id: RES_ID, slug: 'a', display_order: 20, is_published: false },
        { id: RES_ID_2, slug: 'b', display_order: 10, is_published: true },
      ]);
      const { listResourcesAction } = await import('./actions');
      const r = await listResourcesAction();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data).toHaveLength(2);
        // Vérifie que les non-publiées sont incluses (admin only)
        expect(r.data.some((x) => x.is_published === false)).toBe(true);
      }
    });

    it('non-admin (role=null) -> redirect throw', async () => {
      mockEnv();
      state.adminRole = null;
      const { listResourcesAction } = await import('./actions');
      await expect(listResourcesAction()).rejects.toThrow('redirect');
    });
  });

  // -------------------------------------------------------------------------
  // getPublishedResourcesAction
  // -------------------------------------------------------------------------

  describe('getPublishedResourcesAction', () => {
    it('FR -> projette title_fr/body_fr, filtre is_published=true', async () => {
      mockEnv();
      seed([
        {
          id: RES_ID,
          slug: 'pub',
          is_published: true,
          title_fr: 'Bonjour',
          title_en: 'Hello',
          body_fr: 'Markdown FR ici',
          body_en: 'Markdown EN here',
        },
        { id: RES_ID_2, slug: 'draft', is_published: false },
      ]);
      const { getPublishedResourcesAction } = await import('./actions');
      const r = await getPublishedResourcesAction('fr');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data).toHaveLength(1);
        expect(r.data[0].title).toBe('Bonjour');
        expect(r.data[0].body).toBe('Markdown FR ici');
        expect(r.data[0].slug).toBe('pub');
      }
    });

    it('EN -> projette title_en/body_en', async () => {
      mockEnv();
      seed([
        {
          id: RES_ID,
          slug: 'pub',
          is_published: true,
          title_fr: 'Bonjour',
          title_en: 'Hello',
          body_fr: 'FR',
          body_en: 'EN body',
        },
      ]);
      const { getPublishedResourcesAction } = await import('./actions');
      const r = await getPublishedResourcesAction('en');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data[0].title).toBe('Hello');
        expect(r.data[0].body).toBe('EN body');
      }
    });
  });

  // -------------------------------------------------------------------------
  // upsertResourceAction
  // -------------------------------------------------------------------------

  describe('upsertResourceAction', () => {
    const validInput = {
      slug: 'new-resource',
      title_fr: 'Titre FR',
      title_en: 'Title EN',
      body_fr: 'Contenu FR markdown valide ici.',
      body_en: 'Content EN markdown valid here.',
      is_published: true,
      display_order: 100,
    };

    it('create : insert + audit log create', async () => {
      mockEnv();
      const { upsertResourceAction } = await import('./actions');
      const r = await upsertResourceAction(validInput);
      expect(r.ok).toBe(true);
      // Vérifie qu'un insert exhibitor_resources a eu lieu
      const resInsert = state.inserts.find((i) => i.table === 'exhibitor_resources');
      expect(resInsert).toBeDefined();
      expect(resInsert?.row.slug).toBe('new-resource');
      // Vérifie audit log strict
      const audit = state.inserts.find((i) => i.table === 'audit_log');
      expect(audit).toBeDefined();
      expect(audit?.row.action).toBe('create');
      expect(audit?.row.entity_type).toBe('exhibitor_resources');
      expect((audit?.row.after as { kind: string }).kind).toBe('resource_created');
      expect((audit?.row.after as { actor_role: string }).actor_role).toBe('admin');
    });

    it('update : update + audit log update avec before', async () => {
      mockEnv();
      seed([
        {
          id: RES_ID,
          slug: 'old-slug',
          title_fr: 'Ancien titre',
          is_published: false,
          display_order: 50,
        },
      ]);
      const { upsertResourceAction } = await import('./actions');
      const r = await upsertResourceAction({
        ...validInput,
        id: RES_ID,
        slug: 'old-slug',
        title_fr: 'Nouveau titre FR',
      });
      expect(r.ok).toBe(true);
      const audit = state.inserts.find((i) => i.table === 'audit_log');
      expect(audit?.row.action).toBe('update');
      expect((audit?.row.before as { title_fr: string }).title_fr).toBe('Ancien titre');
      expect((audit?.row.after as { title_fr: string }).title_fr).toBe('Nouveau titre FR');
    });

    it('reject slug invalide (regex)', async () => {
      mockEnv();
      const { upsertResourceAction } = await import('./actions');
      const r = await upsertResourceAction({ ...validInput, slug: 'Bad Slug With Spaces' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors?.slug).toMatch(/[Ss]lug/);
    });

    it('reject slug collision (autre id)', async () => {
      mockEnv();
      seed([{ id: RES_ID_2, slug: 'collision-slug' }]);
      const { upsertResourceAction } = await import('./actions');
      const r = await upsertResourceAction({
        ...validInput,
        slug: 'collision-slug',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/déjà utilisé/);
    });

    it('update : slug inchangé -> pas de check collision', async () => {
      mockEnv();
      seed([
        {
          id: RES_ID,
          slug: 'same-slug',
          title_fr: 'Old',
        },
      ]);
      const { upsertResourceAction } = await import('./actions');
      const r = await upsertResourceAction({
        ...validInput,
        id: RES_ID,
        slug: 'same-slug',
      });
      expect(r.ok).toBe(true);
    });

    it('non-admin -> redirect throw', async () => {
      mockEnv();
      state.adminRole = null;
      const { upsertResourceAction } = await import('./actions');
      await expect(upsertResourceAction(validInput)).rejects.toThrow('redirect');
    });
  });

  // -------------------------------------------------------------------------
  // deleteResourceAction
  // -------------------------------------------------------------------------

  describe('deleteResourceAction', () => {
    it('admin -> delete + audit log strict avec before', async () => {
      mockEnv();
      seed([
        {
          id: RES_ID,
          slug: 'to-delete',
          title_fr: 'À supprimer',
        },
      ]);
      const { deleteResourceAction } = await import('./actions');
      const r = await deleteResourceAction({ id: RES_ID });
      expect(r.ok).toBe(true);
      expect(state.deletes).toHaveLength(1);
      const audit = state.inserts.find((i) => i.table === 'audit_log');
      expect(audit?.row.action).toBe('delete');
      expect((audit?.row.before as { kind: string }).kind).toBe('resource_deleted');
      expect((audit?.row.before as { slug: string }).slug).toBe('to-delete');
    });

    it('non-admin -> redirect throw', async () => {
      mockEnv();
      state.adminRole = null;
      const { deleteResourceAction } = await import('./actions');
      await expect(deleteResourceAction({ id: RES_ID })).rejects.toThrow('redirect');
    });

    it('id introuvable -> ok:false', async () => {
      mockEnv();
      const { deleteResourceAction } = await import('./actions');
      const r = await deleteResourceAction({ id: RES_ID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/introuvable/);
    });

    it('id invalide (pas UUID) -> ok:false', async () => {
      mockEnv();
      const { deleteResourceAction } = await import('./actions');
      const r = await deleteResourceAction({ id: 'not-a-uuid' });
      expect(r.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // assertUniqueSlug
  // -------------------------------------------------------------------------

  describe('assertUniqueSlug', () => {
    it('aucune collision -> resolve', async () => {
      mockEnv();
      const { assertUniqueSlug } = await import('./actions');
      await expect(assertUniqueSlug('free-slug')).resolves.toBeUndefined();
    });

    it('collision sur un autre id -> throw', async () => {
      mockEnv();
      seed([{ id: RES_ID, slug: 'taken-slug' }]);
      const { assertUniqueSlug } = await import('./actions');
      await expect(assertUniqueSlug('taken-slug')).rejects.toThrow(/déjà utilisé/);
    });

    it('collision sur le meme id (excludeId) -> resolve', async () => {
      mockEnv();
      seed([{ id: RES_ID, slug: 'my-slug' }]);
      const { assertUniqueSlug } = await import('./actions');
      await expect(assertUniqueSlug('my-slug', RES_ID)).resolves.toBeUndefined();
    });
  });
});
