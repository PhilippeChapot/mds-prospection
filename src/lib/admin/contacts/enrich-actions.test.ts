/**
 * @vitest-environment node
 *
 * P5.x.ConnectOnAirContactsCache (V2) — tests server action
 * enrichContactFromConnectOnAirAction.
 *
 * Couvre :
 *   - RBAC sales rejette
 *   - Contact sans email rejette
 *   - Match strict email_normalized -> patch sans ecraser + audit log
 *   - Email cote MDS avec espaces/majuscules matche email_normalized cote DB
 *     (LOWER+TRIM symetrique)
 *   - Aucun match CoA -> ok:false avec message clair
 *   - Match mais tous champs deja remplis -> ok:false + matchEmail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type CoaMatch = {
  id: string;
  email: string | null;
  email_normalized: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  mobile: string | null;
  role: string | null;
  language: string | null;
  linkedin_url: string | null;
  source_user_id: number;
};

const state = {
  profile: { id: 'u-1', role: 'admin' as 'admin' | 'sales' | 'super_admin' },
  contact: null as Record<string, unknown> | null,
  coaByEmail: new Map<string, CoaMatch>(),
  updates: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
};

function makeClient() {
  return { from: (table: string) => makeChain(table) };
}

function makeChain(table: string) {
  let lastFilterCol: string | null = null;
  let lastFilterVal: unknown = null;
  let pendingPatch: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      lastFilterCol = col;
      lastFilterVal = val;
      return chain;
    },
    maybeSingle: () => {
      if (table === 'contacts' && lastFilterCol === 'id') {
        return Promise.resolve({ data: state.contact, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    limit: () => {
      if (table === 'connectonair_directory_contacts' && lastFilterCol === 'email_normalized') {
        const m = state.coaByEmail.get(String(lastFilterVal));
        return Promise.resolve({ data: m ? [m] : [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    insert: (row: Record<string, unknown>) => {
      if (table === 'audit_log') state.audits.push(row);
      return Promise.resolve({ error: null });
    },
    update: (patch: Record<string, unknown>) => {
      pendingPatch = patch;
      return chain;
    },
    then: (cb: (v: { error: null }) => unknown) => {
      if (pendingPatch && table === 'contacts' && lastFilterCol === 'id') {
        state.updates.push(pendingPatch);
        if (state.contact) {
          for (const [k, v] of Object.entries(pendingPatch)) {
            if (k !== 'last_enrichment_source' && k !== 'last_enriched_at' && k !== 'updated_at') {
              (state.contact as Record<string, unknown>)[k] = v;
            }
          }
        }
      }
      return Promise.resolve({ error: null }).then(cb);
    },
  };
  return chain;
}

function mockEnv() {
  vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: vi.fn(async () => state.profile),
  }));
  vi.doMock('@/lib/auth/role-helpers', () => ({
    hasAdminAccess: (r: string) => r === 'admin' || r === 'super_admin',
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => makeClient(),
  }));
}

function resetState() {
  state.profile = { id: 'u-1', role: 'admin' };
  state.contact = {
    id: 'c-1',
    email: 'Arnaud@Pubradio.FR',
    phone: null,
    role: null,
    first_name: null,
    last_name: 'Existing',
    language: null,
    linkedin_url: null,
  };
  state.coaByEmail.clear();
  state.updates = [];
  state.audits = [];
}

const CONTACT_ID = '11111111-1111-4111-8111-111111111111';

describe('enrichContactFromConnectOnAirAction (P5.x.ContactsCache V2)', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    state.contact!.id = CONTACT_ID;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('Sales rejette (RBAC)', async () => {
    state.profile.role = 'sales';
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(false);
  });

  it('Contact sans email -> rejette', async () => {
    state.contact!.email = null;
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email/);
  });

  it('Match email_normalized -> patch + audit log', async () => {
    // Cote MDS : email "Arnaud@Pubradio.FR" → normalise en
    // "arnaud@pubradio.fr". Cote DB CoA : on indexe sur la valeur normalisee.
    state.coaByEmail.set('arnaud@pubradio.fr', {
      id: 'coa-1',
      email: 'arnaud@pubradio.fr',
      email_normalized: 'arnaud@pubradio.fr',
      first_name: 'Arnaud',
      last_name: 'Benassy', // ne doit PAS ecraser "Existing"
      phone: '+33147000000',
      mobile: null,
      role: 'Responsable Radio',
      language: 'fr', // lower CoA
      linkedin_url: 'https://linkedin.com/in/arnaud',
      source_user_id: 29067,
    });
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fieldsUpdated).toEqual(
        expect.arrayContaining(['phone', 'role', 'first_name', 'linkedin_url', 'language']),
      );
      expect(r.fieldsUpdated).not.toContain('last_name'); // deja rempli
      expect(r.matchEmail).toBe('arnaud@pubradio.fr');
    }
    const patch = state.updates[0];
    expect(patch.last_enrichment_source).toBe('connectonair');
    expect(patch.language).toBe('FR'); // UPPER
    expect((state.audits[0]?.after as Record<string, unknown>)?.kind).toBe(
      'contact_connectonair_enrich',
    );
  });

  it('Email avec espaces/casse mixte cote MDS matche normalize cote CoA', async () => {
    state.contact!.email = '  ARNAUD@PUBRADIO.fr  ';
    state.coaByEmail.set('arnaud@pubradio.fr', {
      id: 'coa-2',
      email: 'arnaud@pubradio.fr',
      email_normalized: 'arnaud@pubradio.fr',
      first_name: null,
      last_name: null,
      phone: '+33147',
      mobile: null,
      role: 'Producer',
      language: null,
      linkedin_url: null,
      source_user_id: 1,
    });
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(true);
  });

  it('Aucun match CoA -> ok:false avec message clair', async () => {
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Aucune correspondance/);
  });

  it('Match mais tous champs deja remplis -> ok:false + matchEmail', async () => {
    state.contact = {
      id: CONTACT_ID,
      email: 'arnaud@pubradio.fr',
      phone: '+33',
      role: 'R',
      first_name: 'F',
      last_name: 'L',
      language: 'FR',
      linkedin_url: 'https://lk',
    };
    state.coaByEmail.set('arnaud@pubradio.fr', {
      id: 'coa-3',
      email: 'arnaud@pubradio.fr',
      email_normalized: 'arnaud@pubradio.fr',
      first_name: 'X',
      last_name: 'X',
      phone: '+1',
      mobile: null,
      role: 'X',
      language: 'fr',
      linkedin_url: 'https://lk',
      source_user_id: 1,
    });
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/deja remplis/);
      expect(r.matchEmail).toBe('arnaud@pubradio.fr');
    }
  });

  it('Fallback phone <- mobile si phone CoA null', async () => {
    state.coaByEmail.set('arnaud@pubradio.fr', {
      id: 'coa-4',
      email: 'arnaud@pubradio.fr',
      email_normalized: 'arnaud@pubradio.fr',
      first_name: null,
      last_name: null,
      phone: null,
      mobile: '+33612345678',
      role: null,
      language: null,
      linkedin_url: null,
      source_user_id: 1,
    });
    mockEnv();
    const { enrichContactFromConnectOnAirAction } = await import('./enrich-actions');
    const r = await enrichContactFromConnectOnAirAction({ contact_id: CONTACT_ID });
    expect(r.ok).toBe(true);
    expect(state.updates[0].phone).toBe('+33612345678');
  });
});
