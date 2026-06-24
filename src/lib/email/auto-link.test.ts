/**
 * @vitest-environment node
 *
 * P12.x.EmailIntegration — autoLinkEmail (contact exact / domaine / prospects).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { autoLinkEmail } from './auto-link';

interface State {
  contacts: Record<string, { id: string; company_id: string | null } | null>;
  companyByDomain: Record<string, { id: string } | null>;
  prospectsByCompany: Record<string, Array<{ id: string }>>;
  inserted: Array<Record<string, unknown>>;
}
let state: State;

function makeDb(): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'contacts') {
        return {
          select: () => ({
            ilike: (_col: string, val: string) => ({
              maybeSingle: () => Promise.resolve({ data: state.contacts[val] ?? null }),
            }),
          }),
        };
      }
      if (table === 'companies') {
        return {
          select: () => ({
            or: (expr: string) => ({
              limit: () => ({
                maybeSingle: () => {
                  const m = expr.match(/primary_domain\.eq\.([^,]+)/);
                  const domain = m?.[1] ?? '';
                  return Promise.resolve({ data: state.companyByDomain[domain] ?? null });
                },
              }),
            }),
          }),
        };
      }
      if (table === 'prospects') {
        return {
          select: () => ({
            eq: (_col: string, companyId: string) =>
              Promise.resolve({ data: state.prospectsByCompany[companyId] ?? [] }),
          }),
        };
      }
      if (table === 'email_links') {
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            state.inserted.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  state = { contacts: {}, companyByDomain: {}, prospectsByCompany: {}, inserted: [] };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('autoLinkEmail (P12.x)', () => {
  it('contact exact → lien contact + company + prospects (confidence 1.0)', async () => {
    state.contacts['jean@acme.fr'] = { id: 'ct-1', company_id: 'co-1' };
    state.prospectsByCompany['co-1'] = [{ id: 'pr-1' }];
    const n = await autoLinkEmail(makeDb(), 'em-1', ['jean@acme.fr']);
    expect(n).toBe(2); // 1 contact/company + 1 prospect
    const cc = state.inserted.find((r) => r.prospect_id === null);
    expect(cc).toMatchObject({
      contact_id: 'ct-1',
      company_id: 'co-1',
      confidence: 1,
      link_method: 'contact_email_exact',
    });
    expect(state.inserted.some((r) => r.prospect_id === 'pr-1')).toBe(true);
  });

  it('pas de contact → fallback company par domaine (0.7)', async () => {
    state.companyByDomain['acme.fr'] = { id: 'co-9' };
    state.prospectsByCompany['co-9'] = [{ id: 'pr-9' }];
    const n = await autoLinkEmail(makeDb(), 'em-2', ['inconnu@acme.fr']);
    expect(n).toBe(2);
    const cc = state.inserted.find((r) => r.prospect_id === null);
    expect(cc).toMatchObject({
      contact_id: null,
      company_id: 'co-9',
      confidence: 0.7,
      link_method: 'company_domain',
    });
  });

  it('aucun match → 0 lien, pas d’insert', async () => {
    const n = await autoLinkEmail(makeDb(), 'em-3', ['ghost@nowhere.io']);
    expect(n).toBe(0);
    expect(state.inserted).toHaveLength(0);
  });

  it('dédup prospect sur plusieurs adresses de la même company', async () => {
    state.contacts['a@acme.fr'] = { id: 'ct-a', company_id: 'co-1' };
    state.contacts['b@acme.fr'] = { id: 'ct-b', company_id: 'co-1' };
    state.prospectsByCompany['co-1'] = [{ id: 'pr-1' }];
    await autoLinkEmail(makeDb(), 'em-4', ['a@acme.fr', 'b@acme.fr']);
    const prospectLinks = state.inserted.filter((r) => r.prospect_id === 'pr-1');
    expect(prospectLinks).toHaveLength(1);
  });

  it('adresses vides ignorées', async () => {
    const n = await autoLinkEmail(makeDb(), 'em-5', ['', '   ']);
    expect(n).toBe(0);
  });
});
