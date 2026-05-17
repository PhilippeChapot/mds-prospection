/**
 * @vitest-environment node
 *
 * P6.x.4-a-bis — tests createLeadFromLandingForm.
 *
 * Cas couverts :
 *   - inputs invalides → rejet sans toucher DB ni emails
 *   - happy path nouvelle société → create company + contact + prospect
 *   - société existante (match name) → reuse, no duplicate
 *   - contact existant sur autre société → warning log + keep existing
 *   - Brevo env var posée → API appelée, sinon skip silencieux
 *   - type='ecole' → source_detail='ecole' + subject email Écoles
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockState {
  companiesByName: Map<string, { id: string; name: string }>;
  companiesByDomain: Map<string, { id: string; name: string }>;
  contactsByEmail: Map<string, { id: string; email: string; company_id: string }>;
  insertedCompanies: Array<Record<string, unknown>>;
  insertedContacts: Array<Record<string, unknown>>;
  insertedProspects: Array<Record<string, unknown>>;
  season_id: string;
}

const state: MockState = {
  companiesByName: new Map(),
  companiesByDomain: new Map(),
  contactsByEmail: new Map(),
  insertedCompanies: [],
  insertedContacts: [],
  insertedProspects: [],
  season_id: 'season-2026',
};

const adminNotifMock = vi.fn();
const resendMock = vi.fn();
const brevoFetchMock = vi.fn();

function mockEnv() {
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'companies') {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                limit: () => {
                  if (col === 'name_normalized' && state.companiesByName.has(val)) {
                    return Promise.resolve({ data: [state.companiesByName.get(val)], error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
              or: (filter: string) => ({
                limit: () => {
                  // primary_domain.eq.X OR alternate_domains.cs.{X}
                  const m = filter.match(/primary_domain\.eq\.([^,]+)/);
                  if (m) {
                    const dom = m[1];
                    if (state.companiesByDomain.has(dom)) {
                      return Promise.resolve({
                        data: [state.companiesByDomain.get(dom)],
                        error: null,
                      });
                    }
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              state.insertedCompanies.push(payload);
              const id = `co-${state.insertedCompanies.length}`;
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { id, name: payload.name },
                      error: null,
                    }),
                }),
              };
            },
          };
        }
        if (table === 'contacts') {
          return {
            select: () => ({
              ilike: (_col: string, val: string) => ({
                limit: () => {
                  const lower = val.toLowerCase();
                  if (state.contactsByEmail.has(lower)) {
                    return Promise.resolve({
                      data: [state.contactsByEmail.get(lower)],
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              state.insertedContacts.push(payload);
              const id = `c-${state.insertedContacts.length}`;
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { id, email: payload.email, company_id: payload.company_id },
                      error: null,
                    }),
                }),
              };
            },
          };
        }
        if (table === 'prospects') {
          return {
            insert: (payload: Record<string, unknown>) => {
              state.insertedProspects.push(payload);
              const id = `p-${state.insertedProspects.length}`;
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id }, error: null }),
                }),
              };
            },
          };
        }
        if (table === 'seasons') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: state.season_id }, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));

  vi.doMock('@/lib/resend/admin-notifier', () => ({
    sendAdminNotification: (...args: unknown[]) => {
      adminNotifMock(...args);
      return Promise.resolve({ recipients: ['x'], delivered: 1, failed: 0 });
    },
  }));

  vi.doMock('@/lib/resend/client', () => ({
    sendTransactionalEmailViaResend: (...args: unknown[]) => {
      resendMock(...args);
      return Promise.resolve();
    },
  }));

  // Mock global fetch for Brevo calls
  global.fetch = brevoFetchMock as unknown as typeof fetch;
}

const VALID_INPUT = {
  type: 'institutionnel' as const,
  org_name: 'UDECAM Test',
  contact_name: 'Jean Test',
  contact_email: 'jean@udecam-test.com',
  contact_phone: '',
  website: '',
  message: 'On veut un stand',
};

function resetState() {
  state.companiesByName.clear();
  state.companiesByDomain.clear();
  state.contactsByEmail.clear();
  state.insertedCompanies.length = 0;
  state.insertedContacts.length = 0;
  state.insertedProspects.length = 0;
}

describe('createLeadFromLandingForm (P6.x.4-a-bis)', () => {
  beforeEach(() => {
    resetState();
    adminNotifMock.mockReset();
    resendMock.mockReset();
    brevoFetchMock.mockReset();
    brevoFetchMock.mockResolvedValue({ ok: true, status: 201, text: () => Promise.resolve('') });
    delete process.env.BREVO_LIST_ID_DEMANDES_TARIF_LANDING;
    delete process.env.BREVO_API_KEY;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse les inputs invalides (email malformé)', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({ ...VALID_INPUT, contact_email: 'pas-un-email' });
    expect(r.ok).toBe(false);
    expect(state.insertedCompanies).toHaveLength(0);
    expect(state.insertedProspects).toHaveLength(0);
    expect(adminNotifMock).not.toHaveBeenCalled();
  });

  it('happy path nouvelle société → create company + contact + prospect (source=landing_form)', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prospect_id).toBe('p-1');
      expect(r.company_id).toBe('co-1');
      expect(r.contact_id).toBe('c-1');
    }
    expect(state.insertedCompanies[0].name).toBe('UDECAM Test');
    expect(state.insertedContacts[0].email).toBe('jean@udecam-test.com');
    expect(state.insertedProspects[0]).toMatchObject({
      status: 'lead',
      source: 'landing_form',
      source_detail: 'institutionnel',
      season_id: 'season-2026',
      is_test: false,
    });
    expect(adminNotifMock).toHaveBeenCalledTimes(1);
    expect(resendMock).toHaveBeenCalledTimes(1);
  });

  it('société existante (name match) → reuse, no INSERT companies', async () => {
    mockEnv();
    state.companiesByName.set('udecam test', { id: 'co-existing', name: 'UDECAM Test' });
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.company_id).toBe('co-existing');
    expect(state.insertedCompanies).toHaveLength(0);
    expect(state.insertedContacts).toHaveLength(1);
    expect(state.insertedProspects[0].company_id).toBe('co-existing');
  });

  it('contact existant sur AUTRE société → keep existing, no INSERT contacts', async () => {
    mockEnv();
    state.contactsByEmail.set('jean@udecam-test.com', {
      id: 'c-existing',
      email: 'jean@udecam-test.com',
      company_id: 'co-other',
    });
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contact_id).toBe('c-existing');
    expect(state.insertedContacts).toHaveLength(0);
    // Le prospect est créé sur la nouvelle company (co-1), mais le contact lié garde son lien d'origine.
    expect(state.insertedProspects[0].primary_contact_id).toBe('c-existing');
  });

  it('Brevo : API appelée si env var posée, skip silencieux sinon', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    // Sans env var → skip
    await createLeadFromLandingForm(VALID_INPUT);
    expect(brevoFetchMock).not.toHaveBeenCalled();

    // Avec env var → fetch appelé
    resetState();
    process.env.BREVO_API_KEY = 'sk_test';
    process.env.BREVO_LIST_ID_DEMANDES_TARIF_LANDING = '777';
    await createLeadFromLandingForm({ ...VALID_INPUT, contact_email: 'second@udecam.com' });
    expect(brevoFetchMock).toHaveBeenCalledTimes(1);
    const url = brevoFetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/contacts/lists/777/contacts/add');
  });

  it('type=ecole → source_detail=ecole + subject email contient "École"', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({
      ...VALID_INPUT,
      type: 'ecole',
      org_name: 'ECS Paris',
      contact_email: 'ecs@ecs.fr',
    });
    expect(r.ok).toBe(true);
    expect(state.insertedProspects[0].source_detail).toBe('ecole');
    expect(adminNotifMock.mock.calls[0][1].subject).toMatch(/École/);
  });
});
