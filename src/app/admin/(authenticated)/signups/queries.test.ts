/**
 * @vitest-environment node
 *
 * P7.x.1.F-quater — regression tests sur listSignups.
 *
 * Cas critique : un signup status='step2_completed' + verified_at + non
 * encore converti DOIT apparaitre dans la liste admin (c'est exactement
 * ce que l'admin doit traiter en priorite).
 *
 * Le bug initial rapporte par Phil etait du a la RLS (`is_admin_or_sales`
 * qui ne reconnaissait pas le role 'super_admin') -- cf. migration 0054.
 * Cote app, listSignups n'a aucun filtre status par defaut, donc on
 * verifie ici qu'aucune regression future ne le rajoute par megarde.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SignupRow {
  id: string;
  email: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  company_name_input: string | null;
  category: 'exposant' | 'partenaire' | null;
  derived_category: string | null;
  language: 'FR' | 'EN';
  status: string;
  ai_classification: unknown;
  created_at: string;
  verified_at: string | null;
  step2_submitted_at: string | null;
  converted_to_prospect_id: string | null;
}

const state: { rows: SignupRow[]; lastFilters: string[] } = {
  rows: [],
  lastFilters: [],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
      from: () => makeQuery(),
    }),
  }));
}

function makeQuery() {
  const chain = {
    select: () => chain,
    order: () => chain,
    eq: (col: string, val: unknown) => {
      state.lastFilters.push(`eq:${col}=${val}`);
      return chain;
    },
    gte: () => chain,
    lte: () => chain,
    or: () => chain,
    range: () => Promise.resolve({ data: state.rows, count: state.rows.length, error: null }),
  };
  return chain;
}

function makeSignup(overrides: Partial<SignupRow>): SignupRow {
  return {
    id: 'id-' + Math.random(),
    email: 'a@b.fr',
    contact_first_name: 'X',
    contact_last_name: 'Y',
    company_name_input: 'Acme',
    category: 'exposant',
    derived_category: 'standard',
    language: 'FR',
    status: 'awaiting_verification',
    ai_classification: null,
    created_at: '2026-05-20T00:00:00Z',
    verified_at: null,
    step2_submitted_at: null,
    converted_to_prospect_id: null,
    ...overrides,
  };
}

describe('listSignups (P7.x.1.F-quater regression)', () => {
  beforeEach(() => {
    vi.resetModules();
    state.rows = [];
    state.lastFilters.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('SANS filtre status -> returns step2_completed non-converted signups', async () => {
    mockEnv();
    state.rows = [
      makeSignup({
        id: 'step2-row',
        status: 'step2_completed',
        verified_at: '2026-05-23T10:00:00Z',
        step2_submitted_at: '2026-05-23T10:30:00Z',
        converted_to_prospect_id: null,
      }),
      makeSignup({ id: 'verified-row', status: 'verified' }),
    ];
    const { listSignups } = await import('./queries');
    const result = await listSignups({});
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.id === 'step2-row')?.status).toBe('step2_completed');
    // Aucun filtre `eq:status=...` n'est applique par defaut (regression
    // guard : si quelqu'un ajoute un default filter status='X', ce test rate).
    expect(state.lastFilters.filter((f) => f.startsWith('eq:status='))).toEqual([]);
  });

  it("avec filtre status='step2_completed' -> applique eq:status=step2_completed", async () => {
    mockEnv();
    const { listSignups } = await import('./queries');
    await listSignups({ status: 'step2_completed' });
    expect(state.lastFilters).toContain('eq:status=step2_completed');
  });

  it('SIGNUP_STATUSES enum inclut step2_completed (fallback safe)', async () => {
    const { SIGNUP_STATUSES } = await import('./types');
    expect((SIGNUP_STATUSES as readonly string[]).includes('step2_completed')).toBe(true);
  });
});
