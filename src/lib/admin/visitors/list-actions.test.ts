/**
 * @vitest-environment node
 *
 * P15.1.VisitorModel — tests listVisitorsAction.
 *
 * Couvre :
 *   - sans filtre → mappe les lignes + total (count) + normalise les jointures
 *   - filtre pole → eq('pole', ...) appliqué
 *   - filtre is_vip → eq('is_vip', true) appliqué
 *   - recherche texte sans match contact → retour vide (early return)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Scenario = {
  contactSearch: Array<{ id: string }>;
  visitorRows: Array<Record<string, unknown>>;
  visitorCount: number;
};

const scenario: Scenario = {
  contactSearch: [{ id: 'ct-1' }],
  visitorRows: [],
  visitorCount: 0,
};

const capturedEq: Array<{ col: string; val: unknown }> = [];

function reset() {
  scenario.contactSearch = [{ id: 'ct-1' }];
  scenario.visitorRows = [];
  scenario.visitorCount = 0;
  capturedEq.length = 0;
}

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      capturedEq.push({ col, val });
      return builder;
    },
    in() {
      return builder;
    },
    or() {
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return builder;
    },
    limit() {
      // contacts search terminal
      return Promise.resolve({ data: scenario.contactSearch, error: null });
    },
    then(resolve: (r: { data: unknown; error: null; count: number }) => unknown) {
      // visitors main query terminal
      return Promise.resolve(
        resolve({ data: scenario.visitorRows, error: null, count: scenario.visitorCount }),
      );
    },
  };
  void table;
  return builder;
}

function mockEnv() {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => ({
      id: 'admin-1',
      email: 'admin@mds.fr',
      full_name: 'Admin',
      role: 'admin' as const,
    })),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({ from: (t: string) => makeBuilder(t) }),
  }));
}

async function loadActions() {
  mockEnv();
  return import('./list-actions');
}

beforeEach(() => {
  vi.resetModules();
  reset();
});

describe('listVisitorsAction (P15.1)', () => {
  it('sans filtre → mappe les lignes + total et normalise les jointures', async () => {
    scenario.visitorCount = 2;
    scenario.visitorRows = [
      {
        id: 'v1',
        pole: 'AUDIO_RADIO',
        visitor_type: 'professional',
        is_vip: true,
        source: 'manual_admin',
        status: 'lead',
        language: 'fr',
        is_big_company: false,
        brevo_synced_at: null,
        notes: null,
        created_at: '2026-06-01T00:00:00Z',
        // jointure 1-1 renvoyée sous forme de tableau → one() prend le 1er
        contact: [
          { id: 'ct1', first_name: 'A', last_name: 'B', email: 'a@b.fr', phone_mobile: null },
        ],
        company: { id: 'co1', name: 'ACME', website: null },
        owner: [{ id: 'u1', full_name: 'Phil', email: 'p@mds.fr' }],
      },
    ];
    const { listVisitorsAction } = await loadActions();
    const res = await listVisitorsAction({});
    expect(res.total).toBe(2);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].contact?.email).toBe('a@b.fr');
    expect(res.rows[0].company?.name).toBe('ACME');
    expect(res.rows[0].owner?.full_name).toBe('Phil');
  });

  it('filtre pole → eq("pole", code) appliqué', async () => {
    const { listVisitorsAction } = await loadActions();
    await listVisitorsAction({ pole: 'VIDEO_CTV' });
    expect(capturedEq).toContainEqual({ col: 'pole', val: 'VIDEO_CTV' });
  });

  it('filtre is_vip → eq("is_vip", true) appliqué', async () => {
    const { listVisitorsAction } = await loadActions();
    await listVisitorsAction({ isVip: true });
    expect(capturedEq).toContainEqual({ col: 'is_vip', val: true });
  });

  it('recherche texte sans match contact → retour vide (early return)', async () => {
    scenario.contactSearch = [];
    const { listVisitorsAction } = await loadActions();
    const res = await listVisitorsAction({ query: 'zzz' });
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
  });
});
