/**
 * @vitest-environment node
 *
 * P11.x.MultiPartnerContentResolution — tests resolveActiveProspectIdForContact.
 * Vérifie la résolution PAR COMPANY (partner_access_grants) + fallback
 * legacy primary_contact_id + isolation cross-company + saison active.
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActiveProspectIdForContact } from './resolve-prospect';

interface State {
  grantCompanyId: string | null;
  seasonId: string | null;
  prospectsByCompany: Record<string, { id: string } | null>;
  primaryProspect: { id: string } | null;
}

/**
 * Mock chainable du client Supabase. Chaque builder enregistre la table +
 * les filtres `eq`, puis `maybeSingle` résout via le state.
 */
function makeClient(state: State): SupabaseClient {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: resolve(table, filters, state), error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function resolve(table: string, filters: Record<string, unknown>, state: State): unknown {
  if (table === 'partner_access_grants') {
    return state.grantCompanyId ? { company_id: state.grantCompanyId } : null;
  }
  if (table === 'seasons') {
    return state.seasonId ? { id: state.seasonId } : null;
  }
  if (table === 'prospects') {
    if (filters.company_id) {
      return state.prospectsByCompany[filters.company_id as string] ?? null;
    }
    if (filters.primary_contact_id) {
      return state.primaryProspect;
    }
  }
  return null;
}

const base: State = {
  grantCompanyId: null,
  seasonId: 'season-2026',
  prospectsByCompany: {},
  primaryProspect: null,
};

describe('resolveActiveProspectIdForContact (P11.x)', () => {
  it('grant company X + prospect visible → retourne ce prospect', async () => {
    const client = makeClient({
      ...base,
      grantCompanyId: 'co-X',
      prospectsByCompany: { 'co-X': { id: 'prospect-X' } },
    });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBe('prospect-X');
  });

  it('résolution par company, pas par primary_contact (primary ≠ contact connecté)', async () => {
    // Le contact connecté n'est PAS le primary du prospect ; on doit quand
    // même renvoyer le prospect de la company.
    const client = makeClient({
      ...base,
      grantCompanyId: 'co-X',
      prospectsByCompany: { 'co-X': { id: 'prospect-de-stephane' } },
      primaryProspect: { id: 'autre-prospect' },
    });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBe('prospect-de-stephane');
  });

  it('grant company X mais aucun prospect visible → null', async () => {
    const client = makeClient({ ...base, grantCompanyId: 'co-X', prospectsByCompany: {} });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBeNull();
  });

  it('isolation cross-company : grant X, prospect existe sur company Y → null', async () => {
    const client = makeClient({
      ...base,
      grantCompanyId: 'co-X',
      prospectsByCompany: { 'co-Y': { id: 'prospect-Y' } },
    });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBeNull();
  });

  it('grant prime sur le fallback primary_contact (ne retombe PAS dessus)', async () => {
    const client = makeClient({
      ...base,
      grantCompanyId: 'co-X',
      prospectsByCompany: {}, // company sans prospect visible
      primaryProspect: { id: 'prospect-primary' }, // existe mais ne doit PAS être renvoyé
    });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBeNull();
  });

  it('pas de saison active → null', async () => {
    const client = makeClient({
      ...base,
      grantCompanyId: 'co-X',
      seasonId: null,
      prospectsByCompany: { 'co-X': { id: 'prospect-X' } },
    });
    expect(await resolveActiveProspectIdForContact(client, 'sophie')).toBeNull();
  });

  it('aucun grant → fallback legacy primary_contact_id → retourne le prospect', async () => {
    const client = makeClient({
      ...base,
      grantCompanyId: null,
      primaryProspect: { id: 'prospect-legacy' },
    });
    expect(await resolveActiveProspectIdForContact(client, 'stephane')).toBe('prospect-legacy');
  });

  it('aucun grant + aucun prospect primary → null', async () => {
    const client = makeClient({ ...base, grantCompanyId: null, primaryProspect: null });
    expect(await resolveActiveProspectIdForContact(client, 'orphan')).toBeNull();
  });
});
