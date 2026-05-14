/**
 * P5.x.20 — tests pullContactsFromBrevo.
 *
 * Validation :
 *   - email déjà en DB → UPDATE brevo_contact_id (linked++)
 *   - email pas en DB, company trouvée par domain → INSERT (created++)
 *   - email pas en DB, pas de company → skippedNoCompany (sans createMissing)
 *   - email pas en DB, pas de domain → skippedNoCompany
 *   - BREVO_API_KEY manquant → throw
 *   - pagination s'arrête quand < PAGE_SIZE retourné
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

type BrevoRow = { id: number; email: string; attributes: Record<string, unknown> };

interface MockBehavior {
  existingByEmail?: Record<string, { id: string; brevo_contact_id: string | null }>;
  companiesByDomain?: Record<string, string>;
}

function mockSupabase(behavior: MockBehavior) {
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  const updateSpy = vi.fn().mockResolvedValue({ error: null });
  const companyInsertSpy = vi.fn().mockResolvedValue({ data: { id: 'co-new' }, error: null });

  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: (table: string) => {
        if (table === 'contacts') {
          return {
            select: () => ({
              ilike: (_col: string, email: string) => ({
                maybeSingle: () => {
                  const r = behavior.existingByEmail?.[email];
                  return Promise.resolve({ data: r ?? null, error: null });
                },
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => updateSpy(payload, id),
            }),
            insert: (payload: Record<string, unknown>) => insertSpy(payload),
          };
        }
        if (table === 'companies') {
          return {
            select: () => ({
              or: (filter: string) => ({
                limit: () => {
                  const match = filter.match(/primary_domain\.ilike\.([^,]+)/);
                  const domain = match?.[1];
                  const id = domain ? behavior.companiesByDomain?.[domain] : undefined;
                  return Promise.resolve({
                    data: id ? [{ id }] : [],
                    error: null,
                  });
                },
              }),
            }),
            insert: (payload: Record<string, unknown>) => ({
              select: () => ({
                maybeSingle: () => companyInsertSpy(payload),
              }),
            }),
          };
        }
        return {};
      },
    }),
  }));

  return { insertSpy, updateSpy, companyInsertSpy };
}

function mockBrevoPage(rows: BrevoRow[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ contacts: rows, count: rows.length }),
  } as Response);
}

describe('pullContactsFromBrevo (P5.x.20)', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_LIST_PROSPECTION_STANDARD_ID = '247';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    if (!ENV_BACKUP.BREVO_API_KEY) delete process.env.BREVO_API_KEY;
    if (!ENV_BACKUP.BREVO_LIST_PROSPECTION_STANDARD_ID) {
      delete process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('links existing DB contact when email already present', async () => {
    const { updateSpy, insertSpy } = mockSupabase({
      existingByEmail: { 'a@b.com': { id: 'c-1', brevo_contact_id: null } },
    });
    mockBrevoPage([{ id: 111, email: 'a@b.com', attributes: {} }]);

    const { pullContactsFromBrevo } = await import('./brevo-pull');
    const result = await pullContactsFromBrevo({ maxPages: 1 });

    expect(result.fetched).toBe(1);
    expect(result.linked).toBe(1);
    expect(result.created).toBe(0);
    expect(updateSpy).toHaveBeenCalledOnce();
    const args = updateSpy.mock.calls[0][0] as { brevo_contact_id: string };
    expect(args.brevo_contact_id).toBe('111');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('creates DB contact when email absent but company found by domain', async () => {
    const { insertSpy } = mockSupabase({
      companiesByDomain: { 'acme.com': 'co-99' },
    });
    mockBrevoPage([
      {
        id: 222,
        email: 'new@acme.com',
        attributes: { FIRSTNAME: 'New', LASTNAME: 'Lead', LANGUE: 'EN' },
      },
    ]);

    const { pullContactsFromBrevo } = await import('./brevo-pull');
    const result = await pullContactsFromBrevo({ maxPages: 1 });

    expect(result.fetched).toBe(1);
    expect(result.created).toBe(1);
    expect(result.linked).toBe(0);
    expect(insertSpy).toHaveBeenCalledOnce();
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.company_id).toBe('co-99');
    expect(payload.email).toBe('new@acme.com');
    expect(payload.brevo_contact_id).toBe('222');
    expect(payload.first_name).toBe('New');
    expect(payload.language).toBe('EN');
  });

  it('skips contact when no DB match and no company by domain (createMissing=false)', async () => {
    const { insertSpy } = mockSupabase({});
    mockBrevoPage([{ id: 333, email: 'orphan@noone.com', attributes: {} }]);

    const { pullContactsFromBrevo } = await import('./brevo-pull');
    const result = await pullContactsFromBrevo({ maxPages: 1 });

    expect(result.skippedNoCompany).toBe(1);
    expect(result.created).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('skips contact with empty/invalid email', async () => {
    mockSupabase({});
    mockBrevoPage([{ id: 444, email: '', attributes: {} }]);

    const { pullContactsFromBrevo } = await import('./brevo-pull');
    const result = await pullContactsFromBrevo({ maxPages: 1 });

    expect(result.skippedNoEmail).toBe(1);
  });

  it('throws when BREVO_API_KEY missing', async () => {
    delete process.env.BREVO_API_KEY;
    mockSupabase({});
    mockBrevoPage([]);
    const { pullContactsFromBrevo } = await import('./brevo-pull');
    await expect(pullContactsFromBrevo({ maxPages: 1 })).rejects.toThrow(/BREVO_API_KEY/);
  });

  it('stops pagination when page returns fewer than PAGE_SIZE', async () => {
    mockSupabase({ existingByEmail: { 'x@y.com': { id: 'c-x', brevo_contact_id: null } } });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ contacts: [{ id: 1, email: 'x@y.com', attributes: {} }], count: 1 }),
      text: () => Promise.resolve(''),
    } as Response);
    global.fetch = fetchSpy;

    const { pullContactsFromBrevo } = await import('./brevo-pull');
    const result = await pullContactsFromBrevo({ maxPages: 5 });

    expect(result.fetched).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
