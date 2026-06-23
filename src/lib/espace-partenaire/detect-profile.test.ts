/**
 * @vitest-environment node
 *
 * P8.2 — tests detectUserProfile.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  contacts: [] as Record<string, unknown>[],
  prospects: [] as Record<string, unknown>[],
  affiliates: [] as Record<string, unknown>[],
  grants: [] as Record<string, unknown>[],
};

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  const filters: Array<{ col: string; val: unknown; op?: 'eq' | 'ilike' }> = [];
  const matchRow = (row: Record<string, unknown>): boolean => {
    for (const f of filters) {
      const v = row[f.col];
      if (f.op === 'ilike' && typeof v === 'string' && typeof f.val === 'string') {
        if (v.toLowerCase() !== f.val.toLowerCase()) return false;
      } else if (v !== f.val) {
        return false;
      }
    }
    return true;
  };
  const nullCols: string[] = [];
  const data = (): Record<string, unknown>[] => {
    if (table === 'contacts') return state.contacts;
    if (table === 'prospects') return state.prospects;
    if (table === 'affiliates') return state.affiliates;
    if (table === 'partner_access_grants') return state.grants;
    return [];
  };
  const matchWithNulls = (row: Record<string, unknown>): boolean =>
    matchRow(row) && nullCols.every((col) => row[col] === null || row[col] === undefined);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'eq' });
      return chain;
    },
    ilike: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'ilike' });
      return chain;
    },
    is: (col: string, val: unknown) => {
      if (val === null) nullCols.push(col);
      return chain;
    },
    update: () => ({ eq: () => ({ then: () => Promise.resolve({ error: null }) }) }),
    order: () => chain,
    limit: () => chain,
    maybeSingle: () =>
      Promise.resolve({ data: data().filter(matchWithNulls)[0] ?? null, error: null }),
    then: (onfulfilled: (v: { error: null; data: unknown[] }) => unknown) =>
      Promise.resolve({ error: null, data: data().filter(matchRow) }).then(onfulfilled),
  };
  return chain;
}

function resetState() {
  state.contacts = [];
  state.prospects = [];
  state.affiliates = [];
  state.grants = [];
}

const C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('detectUserProfile (P8.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('contact partenaire (prospect signe) -> is_partenaire=true + active_prospect_id', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'a@x.fr',
        first_name: 'A',
        last_name: 'X',
        language: 'FR',
        company_id: 'co',
        company: { name: 'AcmeCo' },
      },
    ];
    state.prospects = [
      {
        id: 'p1',
        primary_contact_id: C_ID,
        status: 'signe',
        signed_at: '2026-01-01',
        booth_assignment: null,
        selected_booth_id: null,
      },
    ];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(true);
    expect(r?.is_lead).toBe(false);
    expect(r?.active_prospect_id).toBe('p1');
    expect(r?.has_stand).toBe(false);
    expect(r?.company_name).toBe('AcmeCo');
  });

  it('contact partenaire + has_stand', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'a@x.fr',
        first_name: null,
        last_name: null,
        language: 'FR',
        company_id: null,
        company: null,
      },
    ];
    state.prospects = [
      {
        id: 'p1',
        primary_contact_id: C_ID,
        status: 'signe',
        signed_at: null,
        booth_assignment: 'A12',
        selected_booth_id: null,
      },
    ];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(true);
    expect(r?.has_stand).toBe(true);
  });

  it('contact lead -> is_lead=true', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'a@x.fr',
        first_name: null,
        last_name: null,
        language: 'FR',
        company_id: null,
        company: null,
      },
    ];
    state.prospects = [
      {
        id: 'p1',
        primary_contact_id: C_ID,
        status: 'devis_envoye',
        signed_at: null,
        booth_assignment: null,
        selected_booth_id: null,
      },
    ];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(false);
    expect(r?.is_lead).toBe(true);
  });

  it('contact affilie (match email)', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'aff@x.fr',
        first_name: null,
        last_name: null,
        language: 'FR',
        company_id: null,
        company: null,
      },
    ];
    state.affiliates = [{ id: 'a1', contact_email: 'aff@x.fr', is_active: true }];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_affiliate).toBe(true);
  });

  it('contact simple (sans prospect ni affilie) -> tous flags false', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'simple@x.fr',
        first_name: null,
        last_name: null,
        language: 'FR',
        company_id: null,
        company: null,
      },
    ];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r).not.toBeNull();
    expect(r?.is_partenaire).toBe(false);
    expect(r?.is_lead).toBe(false);
    expect(r?.is_affiliate).toBe(false);
    expect(r?.has_stand).toBe(false);
    expect(r?.active_prospect_id).toBeNull();
  });

  it('contact inexistant -> null', async () => {
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile('00000000-0000-4000-8000-000000000000');
    expect(r).toBeNull();
  });

  // ── P11.x.MultiPartnerAccess ──────────────────────────────────────────────

  it('11. grant actif (sans prospect) -> is_partenaire=true', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'sophie@winmedia.fr',
        first_name: 'Sophie',
        last_name: 'Martin',
        language: 'FR',
        company_id: 'co-win',
        company: { name: 'Winmedia' },
      },
    ];
    // pas de prospect, mais un grant actif (revoked_at = null)
    state.grants = [{ id: 'gr1', contact_id: C_ID, revoked_at: null }];
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(true);
    expect(r?.active_prospect_id).toBeNull();
  });

  it('12. pas de grant, prospect signe (fallback legacy) -> is_partenaire=true', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'contact@legacy.fr',
        first_name: 'Contact',
        last_name: 'Legacy',
        language: 'FR',
        company_id: 'co-leg',
        company: { name: 'LegacyCo' },
      },
    ];
    state.prospects = [
      {
        id: 'p-leg',
        primary_contact_id: C_ID,
        status: 'signe',
        signed_at: '2026-01-15',
        booth_assignment: null,
        selected_booth_id: null,
      },
    ];
    // grants vide → fallback prospects
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(true);
    expect(r?.active_prospect_id).toBe('p-leg');
  });

  it('13. pas de grant ni prospect signe -> is_partenaire=false', async () => {
    state.contacts = [
      {
        id: C_ID,
        email: 'lead@x.fr',
        first_name: 'Lead',
        last_name: null,
        language: 'FR',
        company_id: null,
        company: null,
      },
    ];
    // pas de grants, pas de prospects signés
    mockEnv();
    const { detectUserProfile } = await import('./detect-profile');
    const r = await detectUserProfile(C_ID);
    expect(r?.is_partenaire).toBe(false);
  });
});

describe('getSpaceTitle (P8.2-label-fix)', () => {
  it('partenaire FR -> "Espace partenaire"', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: true, is_affiliate: false }, 'fr')).toBe(
      'Espace partenaire',
    );
  });

  it('partenaire EN -> "Partner area"', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: true, is_affiliate: false }, 'en')).toBe('Partner area');
  });

  it('affilie (et pas partenaire) FR -> "Espace affilié"', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: false, is_affiliate: true }, 'fr')).toBe(
      'Espace affilié',
    );
  });

  it('partenaire + affilie : partenaire prioritaire', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: true, is_affiliate: true }, 'fr')).toBe(
      'Espace partenaire',
    );
  });

  it('contact simple FR -> "Mon espace MediaDays"', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: false, is_affiliate: false }, 'fr')).toBe(
      'Mon espace MediaDays',
    );
  });

  it('contact simple EN -> "My MediaDays space"', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle({ is_partenaire: false, is_affiliate: false }, 'en')).toBe(
      'My MediaDays space',
    );
  });

  it('profile null (cas edge) -> contact simple label', async () => {
    const { getSpaceTitle } = await import('./detect-profile');
    expect(getSpaceTitle(null, 'fr')).toBe('Mon espace MediaDays');
  });
});
