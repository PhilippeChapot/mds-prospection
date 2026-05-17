/**
 * @vitest-environment node
 *
 * P6.x.4-a-bis + a-quater — tests createLeadFromLandingForm.
 *
 * Couvre :
 *   - inputs invalides (email, firstName, lastName required) → rejet sans toucher DB
 *   - happy path FR : prospect créé + Brevo upsert avec FIRSTNAME/LASTNAME/...
 *   - locale EN : language='EN' propagé → contact.language='EN' + Brevo attr LANGUAGE='EN'
 *   - contact existant FR → form EN : language NOT overwritten (preserve)
 *   - company existante + website différent → ajout en alternate_domains
 *   - website normalisé : "https://www.example.com/" → primary_domain='example.com'
 *   - Brevo upsert : tous les attributs custom (PHONE, WEBSITE, COMPANY) présents
 *   - type=ecole → source_detail='ecole'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface CompanyRow {
  id: string;
  name: string;
  primary_domain: string | null;
  alternate_domains: string[];
}
interface ContactRow {
  id: string;
  email: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: 'FR' | 'EN';
}

interface MockState {
  companiesByName: Map<string, CompanyRow>;
  companiesByDomain: Map<string, CompanyRow>;
  contactsByEmail: Map<string, ContactRow>;
  insertedCompanies: Array<Record<string, unknown>>;
  insertedContacts: Array<Record<string, unknown>>;
  insertedProspects: Array<Record<string, unknown>>;
  companyUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  contactUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  season_id: string;
}

const state: MockState = {
  companiesByName: new Map(),
  companiesByDomain: new Map(),
  contactsByEmail: new Map(),
  insertedCompanies: [],
  insertedContacts: [],
  insertedProspects: [],
  companyUpdates: [],
  contactUpdates: [],
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
                      data: {
                        id,
                        name: payload.name,
                        primary_domain: payload.primary_domain ?? null,
                        alternate_domains: [],
                      },
                      error: null,
                    }),
                }),
              };
            },
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                state.companyUpdates.push({ id, patch });
                return Promise.resolve({ error: null });
              },
            }),
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
                      data: {
                        id,
                        email: payload.email,
                        company_id: payload.company_id,
                        first_name: payload.first_name ?? null,
                        last_name: payload.last_name ?? null,
                        phone: payload.phone ?? null,
                        language: payload.language,
                      },
                      error: null,
                    }),
                }),
              };
            },
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                state.contactUpdates.push({ id, patch });
                return Promise.resolve({ error: null });
              },
            }),
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

  global.fetch = brevoFetchMock as unknown as typeof fetch;
}

const VALID_INPUT = {
  type: 'institutionnel' as const,
  org_name: 'UDECAM Test',
  first_name: 'Jean',
  last_name: 'Test',
  contact_email: 'jean@udecam-test.com',
  contact_phone: '',
  website: '',
  message: 'On veut un stand',
  language: 'FR' as const,
};

function resetState() {
  state.companiesByName.clear();
  state.companiesByDomain.clear();
  state.contactsByEmail.clear();
  state.insertedCompanies.length = 0;
  state.insertedContacts.length = 0;
  state.insertedProspects.length = 0;
  state.companyUpdates.length = 0;
  state.contactUpdates.length = 0;
}

describe('createLeadFromLandingForm (P6.x.4-a-bis + a-quater)', () => {
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
  });

  it('Zod : first_name + last_name tous deux required (min 2 chars)', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r1 = await createLeadFromLandingForm({ ...VALID_INPUT, first_name: 'J' });
    expect(r1.ok).toBe(false);
    const r2 = await createLeadFromLandingForm({ ...VALID_INPUT, last_name: '' });
    expect(r2.ok).toBe(false);
  });

  it('happy path FR : prospect créé + contact.language=FR + Brevo upsert avec attrs', async () => {
    mockEnv();
    process.env.BREVO_API_KEY = 'sk_test';
    process.env.BREVO_LIST_ID_DEMANDES_TARIF_LANDING = '888';
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({
      ...VALID_INPUT,
      contact_phone: '+33 6 12 34 56 78',
      website: 'https://www.udecam-test.com/',
    });
    expect(r.ok).toBe(true);
    expect(state.insertedContacts[0].language).toBe('FR');
    expect(state.insertedContacts[0].first_name).toBe('Jean');
    expect(state.insertedContacts[0].last_name).toBe('Test');

    // Brevo POST /contacts avec attributs
    expect(brevoFetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(brevoFetchMock.mock.calls[0][1].body as string) as {
      attributes: Record<string, unknown>;
      listIds: number[];
      updateEnabled: boolean;
    };
    expect(body.attributes.FIRSTNAME).toBe('Jean');
    expect(body.attributes.LASTNAME).toBe('Test');
    expect(body.attributes.COMPANY).toBe('UDECAM Test');
    expect(body.attributes.LANGUAGE).toBe('FR');
    expect(body.attributes.PHONE).toBe('+33 6 12 34 56 78');
    expect(body.attributes.WEBSITE).toBe('https://www.udecam-test.com/');
    expect(body.listIds).toEqual([888]);
    expect(body.updateEnabled).toBe(true);
  });

  it('locale EN : language=EN propagé sur contact + Brevo attr LANGUAGE=EN', async () => {
    mockEnv();
    process.env.BREVO_API_KEY = 'sk_test';
    const { createLeadFromLandingForm } = await import('./lead-actions');
    await createLeadFromLandingForm({ ...VALID_INPUT, language: 'EN' });
    expect(state.insertedContacts[0].language).toBe('EN');
    const body = JSON.parse(brevoFetchMock.mock.calls[0][1].body as string) as {
      attributes: { LANGUAGE: string };
    };
    expect(body.attributes.LANGUAGE).toBe('EN');
  });

  it('contact existant même company + champs vides → enrichit first_name/last_name/phone (COALESCE)', async () => {
    mockEnv();
    // Préseed la company
    state.companiesByName.set('udecam test', {
      id: 'co-existing',
      name: 'UDECAM Test',
      primary_domain: 'udecam-test.com',
      alternate_domains: [],
    });
    state.contactsByEmail.set('jean@udecam-test.com', {
      id: 'c-existing',
      email: 'jean@udecam-test.com',
      company_id: 'co-existing',
      first_name: null,
      last_name: null,
      phone: null,
      language: 'FR',
    });
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({
      ...VALID_INPUT,
      contact_phone: '+33 6 22 22 22 22',
    });
    expect(r.ok).toBe(true);
    expect(state.contactUpdates).toHaveLength(1);
    expect(state.contactUpdates[0].patch).toMatchObject({
      first_name: 'Jean',
      last_name: 'Test',
      phone: '+33 6 22 22 22 22',
    });
  });

  it('contact existant FR + form EN → language NOT overwritten (COALESCE doctrine)', async () => {
    mockEnv();
    state.contactsByEmail.set('jean@udecam-test.com', {
      id: 'c-existing',
      email: 'jean@udecam-test.com',
      company_id: 'co-other',
      first_name: 'Jean',
      last_name: 'Existant',
      phone: '+33 1 11 11 11 11',
      language: 'FR',
    });
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({ ...VALID_INPUT, language: 'EN' });
    expect(r.ok).toBe(true);
    // Contact existant pas modifié (autre company, on garde tel quel)
    expect(state.contactUpdates).toHaveLength(0);
    if (r.ok) expect(r.contact_id).toBe('c-existing');
  });

  it('company existante + website différent → ajout en alternate_domains', async () => {
    mockEnv();
    state.companiesByName.set('udecam test', {
      id: 'co-existing',
      name: 'UDECAM Test',
      primary_domain: 'udecam.fr',
      alternate_domains: [],
    });
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({
      ...VALID_INPUT,
      website: 'https://www.udecam-alt.com',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.company_id).toBe('co-existing');
    // UPDATE alternate_domains
    const altUpd = state.companyUpdates.find(
      (u) => 'alternate_domains' in (u.patch as Record<string, unknown>),
    );
    expect(altUpd).toBeDefined();
    expect(altUpd?.patch.alternate_domains).toEqual(['udecam-alt.com']);
  });

  it('website normalisé : "https://www.example.com/page" → primary_domain="example.com"', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    await createLeadFromLandingForm({ ...VALID_INPUT, website: 'https://www.example.com/page' });
    expect(state.insertedCompanies[0].primary_domain).toBe('example.com');
  });

  it('happy path EN : type=ecole, source_detail=ecole, subject "École"', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm({
      ...VALID_INPUT,
      type: 'ecole',
      org_name: 'ECS Paris',
      contact_email: 'ecs@ecs.fr',
      language: 'EN',
    });
    expect(r.ok).toBe(true);
    expect(state.insertedProspects[0].source_detail).toBe('ecole');
    expect(adminNotifMock.mock.calls[0][1].subject).toMatch(/École/);
  });

  it('Brevo skip silencieux si BREVO_API_KEY absente', async () => {
    mockEnv();
    const { createLeadFromLandingForm } = await import('./lead-actions');
    const r = await createLeadFromLandingForm(VALID_INPUT);
    expect(r.ok).toBe(true);
    expect(brevoFetchMock).not.toHaveBeenCalled();
  });
});
