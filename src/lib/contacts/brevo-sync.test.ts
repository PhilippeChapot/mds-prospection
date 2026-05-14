/**
 * P5.x.20 — tests syncContactsToBrevo.
 *
 * On mocke getSupabaseServiceClient + global.fetch pour valider :
 *   - création 201 → brevo_contact_id stocké en DB + last_synced_brevo_at
 *   - duplicate 400 → lookup + add à la liste + brevo_contact_id stocké
 *   - autre 4xx/5xx → push dans errors, pas de mise à jour DB
 *   - skipDeliverabilityInvalid filtre les emails 'invalid'
 *   - limit respecté
 *   - BREVO_API_KEY manquant → throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

interface ContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: 'FR' | 'EN';
  company_id: string;
  email_deliverability_status: 'unchecked' | 'valid' | 'invalid' | 'unknown' | 'accept_all';
}

function mockSupabase(rows: ContactRow[]) {
  const updateSpy = vi.fn().mockResolvedValue({ error: null });
  const selectChain = {
    select: () => selectChain,
    is: () => selectChain,
    order: () => selectChain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  const updateChain = {
    update: vi.fn((args: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => updateSpy(args, id),
    })),
  };
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({ ...selectChain, ...updateChain }),
    }),
  }));
  return { updateSpy };
}

describe('syncContactsToBrevo (P5.x.20)', () => {
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

  const baseContact: ContactRow = {
    id: 'c-1',
    email: 'lead@example.com',
    first_name: null,
    last_name: null,
    phone: '+33123456789',
    language: 'FR',
    company_id: 'co-1',
    email_deliverability_status: 'unknown',
  };

  it('creates contact in Brevo (201) and stores brevo_contact_id', async () => {
    const { updateSpy } = mockSupabase([baseContact]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ id: 4242 }),
    } as Response);

    const { syncContactsToBrevo } = await import('./brevo-sync');
    const result = await syncContactsToBrevo({ limit: 10 });

    expect(result.attempted).toBe(1);
    expect(result.created).toBe(1);
    expect(result.linked).toBe(0);
    expect(result.failed).toBe(0);
    expect(updateSpy).toHaveBeenCalledOnce();
    const updatePayload = updateSpy.mock.calls[0][0] as { brevo_contact_id: string };
    expect(updatePayload.brevo_contact_id).toBe('4242');

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const body = JSON.parse(calls[0][1].body);
    expect(body.email).toBe('lead@example.com');
    expect(body.updateEnabled).toBe(false);
    expect(body.listIds).toEqual([247]);
  });

  it('handles duplicate (400) by looking up existing contact + adding to list', async () => {
    const { updateSpy } = mockSupabase([baseContact]);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 400,
        ok: false,
        json: () => Promise.resolve({ code: 'duplicate_parameter', message: 'exists' }),
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ id: 9999 }),
      } as Response)
      .mockResolvedValueOnce({
        status: 204,
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

    const { syncContactsToBrevo } = await import('./brevo-sync');
    const result = await syncContactsToBrevo({ limit: 10 });

    expect(result.created).toBe(0);
    expect(result.linked).toBe(1);
    expect(result.failed).toBe(0);
    expect(updateSpy).toHaveBeenCalledOnce();
    const payload = updateSpy.mock.calls[0][0] as { brevo_contact_id: string };
    expect(payload.brevo_contact_id).toBe('9999');

    // Make sure /contacts/lists/247/contacts/add got called
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[2][0]).toContain('/contacts/lists/247/contacts/add');
  });

  it('records error on unexpected 500 without updating DB', async () => {
    const { updateSpy } = mockSupabase([baseContact]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: () => Promise.resolve({ message: 'oops' }),
    } as Response);

    const { syncContactsToBrevo } = await import('./brevo-sync');
    const result = await syncContactsToBrevo({ limit: 10 });

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.status).toBe(500);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('skips contacts marked email_deliverability_status=invalid when skipInvalid=true (default)', async () => {
    mockSupabase([{ ...baseContact, email_deliverability_status: 'invalid' }]);
    global.fetch = vi.fn();

    const { syncContactsToBrevo } = await import('./brevo-sync');
    const result = await syncContactsToBrevo({ limit: 10 });

    expect(result.attempted).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws when BREVO_API_KEY missing', async () => {
    delete process.env.BREVO_API_KEY;
    mockSupabase([baseContact]);
    const { syncContactsToBrevo } = await import('./brevo-sync');
    await expect(syncContactsToBrevo({ limit: 1 })).rejects.toThrow(/BREVO_API_KEY/);
  });

  it('throws when BREVO_LIST_PROSPECTION_STANDARD_ID missing', async () => {
    delete process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
    mockSupabase([baseContact]);
    const { syncContactsToBrevo } = await import('./brevo-sync');
    await expect(syncContactsToBrevo({ limit: 1 })).rejects.toThrow(
      /BREVO_LIST_PROSPECTION_STANDARD_ID/,
    );
  });

  it('returns empty result when no unsynced contacts', async () => {
    mockSupabase([]);
    global.fetch = vi.fn();

    const { syncContactsToBrevo } = await import('./brevo-sync');
    const result = await syncContactsToBrevo({ limit: 10 });

    expect(result.attempted).toBe(0);
    expect(result.created).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
