/**
 * @vitest-environment node
 *
 * P5.x.ExternalEvents — tests importer generique.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NormalizedImport } from './types';

const state = {
  // Map de companies "deja en base" indexees par name_normalized.
  byNormalizedName: new Map<string, { id: string; external_event_tags: Record<string, unknown> }>(),
  // Map de contacts "deja en base" indexes par email.
  byEmail: new Map<string, { id: string }>(),
  // Last operations enregistrées (audit cote tests).
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{
    table: string;
    patch: Record<string, unknown>;
    filter: { col: string; val: unknown };
  }>,
};

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let lastFilterCol: string | null = null;
  let lastFilterVal: unknown = null;
  let pendingPatch: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilterCol = col;
      lastFilterVal = val;
      return chain;
    },
    limit: () => chain,
    maybeSingle: () => {
      if (table === 'companies' && lastFilterCol === 'id') {
        for (const [, v] of state.byNormalizedName) {
          if (v.id === lastFilterVal)
            return Promise.resolve({
              data: { id: v.id, website: null, country: null, description: null },
              error: null,
            });
        }
      }
      return Promise.resolve({ data: null, error: null });
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row;
      state.inserts.push({ table, row });
      // Pour le retour d insert avec select().single() :
      const id = `gen-${table}-${state.inserts.length}`;
      if (table === 'companies' && typeof row.name_normalized === 'string') {
        state.byNormalizedName.set(row.name_normalized, {
          id,
          external_event_tags: (row.external_event_tags ?? {}) as Record<string, unknown>,
        });
      }
      if (table === 'contacts' && typeof row.email === 'string') {
        state.byEmail.set(row.email, { id });
      }
      // chain support pour .select().single()
      const insertChain: Record<string, unknown> = {
        select: () => insertChain,
        single: () => Promise.resolve({ data: { id }, error: null }),
        then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
      };
      return insertChain;
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => {
      if (pendingPatch && lastFilterCol) {
        state.updates.push({
          table,
          patch: pendingPatch,
          filter: { col: lastFilterCol, val: lastFilterVal },
        });
      }
      void pendingInsert;
      return Promise.resolve({ error: null }).then(cb);
    },
  };
  // Special handling for select().eq().limit() returning data array:
  chain.select = () => {
    const selectChain: Record<string, unknown> = {
      eq: (col: string, val: unknown) => {
        lastFilterCol = col;
        lastFilterVal = val;
        return selectChain;
      },
      limit: () => {
        if (table === 'companies' && lastFilterCol === 'name_normalized') {
          const found = state.byNormalizedName.get(String(lastFilterVal));
          return Promise.resolve({
            data: found
              ? [
                  {
                    id: found.id,
                    external_event_tags: found.external_event_tags,
                    name_normalized: lastFilterVal,
                  },
                ]
              : [],
            error: null,
          });
        }
        if (table === 'contacts' && lastFilterCol === 'email') {
          const found = state.byEmail.get(String(lastFilterVal));
          return Promise.resolve({
            data: found ? [{ id: found.id }] : [],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
      maybeSingle: () => {
        if (table === 'companies' && lastFilterCol === 'id') {
          const id = String(lastFilterVal);
          for (const [, v] of state.byNormalizedName) {
            if (v.id === id)
              return Promise.resolve({
                data: { id: v.id, website: null, country: null, description: null },
                error: null,
              });
          }
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return selectChain;
  };
  return chain;
}

function resetState() {
  state.byNormalizedName.clear();
  state.byEmail.clear();
  state.inserts = [];
  state.updates = [];
}

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

describe('importNormalized (P5.x.ExternalEvents)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Match strict : tag ajoute a company existante + contact cree', async () => {
    state.byNormalizedName.set('acme', { id: 'co-1', external_event_tags: {} });
    mockEnv();
    const { importNormalized } = await import('./importer');
    const data: NormalizedImport = {
      source: 'rde',
      companies: [
        {
          rawName: 'Acme',
          normalizedName: 'acme',
          eventKey: 'rde',
          years: [2026],
          contacts: [{ email: 'a@acme.com', emailConfidence: 'low', fullName: 'A B' }],
        },
      ],
    };
    const stats = await importNormalized(data, { dryRun: false });
    expect(stats.matchedCompanies).toBe(1);
    expect(stats.createdCompanies).toBe(0);
    expect(stats.createdContacts).toBe(1);
    // update tags
    const tagUpdate = state.updates.find(
      (u) => u.table === 'companies' && u.patch.external_event_tags !== undefined,
    );
    expect(tagUpdate).toBeTruthy();
    expect(tagUpdate?.patch.external_event_tags).toEqual({ rde: [2026] });
  });

  it('Pas de match : company creee unverified + contact cree', async () => {
    mockEnv();
    const { importNormalized } = await import('./importer');
    const data: NormalizedImport = {
      source: 'md_classic',
      companies: [
        {
          rawName: 'NewCo',
          normalizedName: 'newco',
          eventKey: 'mediadays_classic',
          years: [2025],
          contacts: [],
        },
      ],
    };
    const stats = await importNormalized(data, { dryRun: false });
    expect(stats.createdCompanies).toBe(1);
    const insert = state.inserts.find((i) => i.table === 'companies');
    expect(insert?.row.external_events_review_status).toBe('unverified');
    expect(insert?.row.external_event_tags).toEqual({ mediadays_classic: [2025] });
  });

  it('emailConfidence=low : prefs marketing coupees', async () => {
    state.byNormalizedName.set('foo', { id: 'co-1', external_event_tags: {} });
    mockEnv();
    const { importNormalized } = await import('./importer');
    await importNormalized(
      {
        source: 'rde',
        companies: [
          {
            rawName: 'Foo',
            normalizedName: 'foo',
            eventKey: 'rde',
            years: [2026],
            contacts: [{ email: 'lowconf@foo.com', emailConfidence: 'low', fullName: 'X Y' }],
          },
        ],
      },
      { dryRun: false },
    );
    const insert = state.inserts.find((i) => i.table === 'contacts');
    expect(insert?.row.marketing_consent).toBe(false);
    expect(insert?.row.lifecycle_emails_enabled).toBe(false);
    expect(insert?.row.email_confidence).toBe('low');
    expect(insert?.row.import_source).toBe('import_rde');
  });

  it('Dry-run : aucune ecriture, stats correctes', async () => {
    mockEnv();
    const { importNormalized } = await import('./importer');
    const stats = await importNormalized(
      {
        source: 'cbd',
        companies: [
          {
            rawName: 'X',
            normalizedName: 'x',
            eventKey: 'cbd',
            years: [2025],
            contacts: [{ email: 'a@x.com', emailConfidence: 'medium' }],
          },
        ],
      },
      { dryRun: true },
    );
    expect(stats.createdCompanies).toBe(1);
    expect(stats.createdContacts).toBe(1);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('Idempotent : 2eme run avec meme data = 0 nouvelles ecritures', async () => {
    state.byNormalizedName.set('idem', {
      id: 'co-idem',
      external_event_tags: { satis: [2025] },
    });
    state.byEmail.set('e@idem.com', { id: 'ct-idem' });
    mockEnv();
    const { importNormalized } = await import('./importer');
    const stats = await importNormalized(
      {
        source: 'satis',
        companies: [
          {
            rawName: 'Idem',
            normalizedName: 'idem',
            eventKey: 'satis',
            years: [2025],
            contacts: [{ email: 'e@idem.com', emailConfidence: 'verified' }],
          },
        ],
      },
      { dryRun: false },
    );
    expect(stats.matchedCompanies).toBe(1);
    expect(stats.matchedContacts).toBe(1);
    expect(stats.createdContacts).toBe(0);
    // tags identiques -> no update.
    const tagUpdate = state.updates.find(
      (u) => u.table === 'companies' && u.patch.external_event_tags !== undefined,
    );
    expect(tagUpdate).toBeUndefined();
  });
});
