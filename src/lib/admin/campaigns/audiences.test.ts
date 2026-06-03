/**
 * @vitest-environment node
 *
 * P8.3 — tests audiences + filtrage prefs RGPD (cœur P8.1↔P8.3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAudience, AUDIENCES, getAudienceDef } from './audiences';

interface ContactFixture {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: 'FR' | 'EN';
  company: { name: string; pole?: { code: string } } | null;
  preferences: Record<string, unknown> | null;
}

const state = {
  contacts: [] as ContactFixture[],
  prospects: [] as Record<string, unknown>[],
  affiliates: [] as Record<string, unknown>[],
  candidateIds: [] as string[],
};

// Mock supabase : pour resolveCandidateContactIds on accepte un override
// "candidateIds" qui shortcut la query. Pour le fetch contacts on retourne
// la fixture state.contacts (filtree par IN ids).
function makeChain(table: string) {
  const filters: Array<{
    col: string;
    val: unknown;
    op: 'eq' | 'in' | 'not' | 'lt' | 'is' | 'ilike';
  }> = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'eq' });
      return chain;
    },
    in: (col: string, vals: unknown) => {
      filters.push({ col, val: vals, op: 'in' });
      return chain;
    },
    not: (col: string, _op: string, val: unknown) => {
      filters.push({ col, val, op: 'not' });
      return chain;
    },
    is: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'is' });
      return chain;
    },
    lt: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'lt' });
      return chain;
    },
    ilike: (col: string, val: unknown) => {
      filters.push({ col, val, op: 'ilike' });
      return chain;
    },
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (onfulfilled: (v: { error: null; data: unknown }) => unknown) => {
      // Pour 'contacts' avec IN ids, retourner les fixtures matchant.
      let data: unknown = [];
      if (table === 'contacts') {
        const inFilter = filters.find((f) => f.op === 'in' && f.col === 'id');
        if (inFilter) {
          const ids = inFilter.val as string[];
          data = state.contacts.filter((c) => ids.includes(c.id));
        } else {
          data = state.contacts.map((c) => ({ id: c.id }));
        }
      } else if (table === 'prospects') {
        data = state.prospects;
      } else if (table === 'affiliates') {
        data = state.affiliates;
      }
      return Promise.resolve({ error: null, data }).then(onfulfilled);
    },
  };
  return chain;
}

const supabaseMock = { from: (table: string) => makeChain(table) } as unknown as Parameters<
  typeof resolveAudience
>[0];

function makeContact(over: Partial<ContactFixture> & { id: string }): ContactFixture {
  return {
    email: `${over.id}@x.fr`,
    first_name: null,
    last_name: null,
    language: 'FR',
    company: null,
    preferences: {
      pref_general: true,
      pref_exposant: false,
      pref_facturation: false,
      pref_kit_media: false,
      pref_administration: false,
      pref_partenariat: false,
      pref_post_event: false,
      unsubscribed_all_at: null,
    },
    ...over,
  };
}

describe('AUDIENCES catalog (P8.3)', () => {
  it('expose 13 audiences predefinies', () => {
    expect(AUDIENCES.length).toBe(13);
  });

  it('chaque audience a une defaultCategory valide', () => {
    const valid = [
      'general',
      'partenaire',
      'facturation',
      'kit_media',
      'administration',
      'partenariat',
      'post_event',
    ];
    for (const a of AUDIENCES) {
      expect(valid).toContain(a.defaultCategory);
    }
  });

  it('getAudienceDef trouve une cle connue', () => {
    expect(getAudienceDef('newsletter_subscribers')?.label).toBe('Abonnés newsletter');
  });
});

describe('resolveAudience (P8.3 RGPD)', () => {
  beforeEach(() => {
    state.contacts = [];
    state.prospects = [];
    state.affiliates = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('all_contacts + category=general : tous opt-in pref_general (default true) -> eligible', async () => {
    state.contacts = [
      makeContact({ id: 'c1', email: 'a@x.fr' }),
      makeContact({ id: 'c2', email: 'b@x.fr' }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'general',
    });
    expect(r.eligible).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
  });

  it('RGPD : contact unsubscribed_all_at -> skipped reason=unsubscribed', async () => {
    state.contacts = [
      makeContact({ id: 'c1', email: 'a@x.fr' }),
      makeContact({
        id: 'c2',
        email: 'b@x.fr',
        preferences: { pref_general: true, unsubscribed_all_at: '2026-01-01T00:00:00Z' },
      }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'general',
    });
    expect(r.eligible.map((e) => e.email)).toEqual(['a@x.fr']);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toBe('unsubscribed');
  });

  it('RGPD : contact pref_facturation=false sur campagne facturation -> skipped pref_off', async () => {
    state.contacts = [
      makeContact({
        id: 'c1',
        email: 'a@x.fr',
        preferences: {
          pref_facturation: true,
          unsubscribed_all_at: null,
        },
      }),
      makeContact({
        id: 'c2',
        email: 'b@x.fr',
        preferences: {
          pref_facturation: false,
          unsubscribed_all_at: null,
        },
      }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'facturation',
    });
    expect(r.eligible.map((e) => e.email)).toEqual(['a@x.fr']);
    expect(r.skipped[0].reason).toBe('pref_off');
  });

  it('emails invalides -> skipped invalid_email', async () => {
    state.contacts = [
      makeContact({ id: 'c1', email: 'noatsign' }),
      makeContact({ id: 'c2', email: '   ' }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'general',
    });
    expect(r.eligible).toHaveLength(0);
    expect(r.skipped.filter((s) => s.reason === 'invalid_email')).toHaveLength(2);
  });

  it('dedup : meme email apparaissant 2x -> 2eme skipped duplicate', async () => {
    state.contacts = [
      makeContact({ id: 'c1', email: 'a@x.fr' }),
      makeContact({ id: 'c2', email: 'A@X.FR' }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'general',
    });
    expect(r.eligible).toHaveLength(1);
    expect(r.skipped.filter((s) => s.reason === 'duplicate')).toHaveLength(1);
  });

  it("filtre langue : langue='FR' filtre les EN -> pref_off (proxy filter)", async () => {
    state.contacts = [
      makeContact({ id: 'c1', email: 'fr@x.fr', language: 'FR' }),
      makeContact({ id: 'c2', email: 'en@x.fr', language: 'EN' }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'all_contacts',
      category: 'general',
      filters: { langue: 'FR' },
    });
    expect(r.eligible.map((e) => e.email)).toEqual(['fr@x.fr']);
  });

  it('audience partenaires_paid + pref_exposant=true -> eligible', async () => {
    // Mock simplifie : on suppose que la query prospects filtre deja
    // serveur (filtres `not acompte_paid_at is null`). On seed seulement
    // les prospects qui passent le filtre. C'est la couche resolveAudience
    // qu'on teste — pas le mock supabase exhaustif.
    state.prospects = [
      {
        primary_contact_id: 'c1',
        status: 'signe',
        acompte_paid_at: '2026-01-01',
        signed_at: '2025-12-01',
        created_at: '2025-11-01',
      },
    ];
    state.contacts = [
      makeContact({
        id: 'c1',
        email: 'a@x.fr',
        preferences: { pref_exposant: true, unsubscribed_all_at: null },
      }),
    ];
    const r = await resolveAudience(supabaseMock, {
      audienceKey: 'partenaires_paid',
      category: 'partenaire',
    });
    expect(r.eligible.map((e) => e.email)).toEqual(['a@x.fr']);
  });
});
