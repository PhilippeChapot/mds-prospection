/**
 * P5.x.22 — tests admin-queries (listContactsPaginated + getContactsKpis +
 * listContactsForCompany).
 *
 * On mocke createSupabaseServerClient pour valider :
 *   - les filtres deviennent les bons .eq / .ilike / .is / .or
 *   - le shape du retour est correct (company nested, pole_code, etc.)
 *   - getContactsKpis renvoie les 6 compteurs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface QueryCall {
  table: string;
  steps: Array<{ op: string; args: unknown[] }>;
}

function makeMockSupabase(
  responses: Record<string, { data?: unknown; count?: number; error?: { message: string } | null }>,
) {
  const calls: QueryCall[] = [];

  function makeBuilder(
    table: string,
    _kind: 'select' | 'select-head' | 'rpc' | 'maybeSingle' | 'order',
  ) {
    const call: QueryCall = { table, steps: [] };
    calls.push(call);

    const builder: Record<string, unknown> = {};
    const chainable = [
      'select',
      'eq',
      'neq',
      'ilike',
      'is',
      'or',
      'in',
      'order',
      'range',
      'limit',
      'not',
    ];

    for (const op of chainable) {
      builder[op] = (...args: unknown[]) => {
        call.steps.push({ op, args });
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // Make the builder thenable so `await query` resolves to the response.
    builder.then = (resolve: (r: unknown) => void) => {
      const key = `${table}:${call.steps[0]?.args?.[0] ?? ''}`;
      const resp = responses[key] ?? responses[table] ?? { data: [], error: null };
      resolve({ data: resp.data ?? [], error: resp.error ?? null, count: resp.count ?? null });
    };
    return builder;
  }

  return {
    from: (table: string) => makeBuilder(table, 'select'),
    calls,
  };
}

describe('admin-queries (P5.x.22)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockServerClient(responses: Parameters<typeof makeMockSupabase>[0]) {
    const mock = makeMockSupabase(responses);
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: () => Promise.resolve(mock),
    }));
    return mock;
  }

  it('listContactsPaginated maps DB row to ContactListRow with nested company.pole_code', async () => {
    mockServerClient({
      contacts: {
        data: [
          {
            id: 'c-1',
            email: 'lead@acme.com',
            first_name: 'Alice',
            last_name: 'Lead',
            phone: null,
            role: null,
            is_primary: true,
            language: 'FR',
            marketing_consent: true,
            lifecycle_emails_enabled: true,
            email_deliverability_status: 'unknown',
            brevo_contact_id: '42',
            last_synced_brevo_at: '2026-05-14T00:00:00Z',
            created_at: '2026-05-14T00:00:00Z',
            company: { id: 'co-1', name: 'Acme', pole_id: 'p-1', pole: { code: 'AUDIO' } },
          },
        ],
        count: 1,
        error: null,
      },
    });

    const { listContactsPaginated } = await import('./admin-queries');
    const result = await listContactsPaginated({});

    expect(result.total).toBe(1);
    expect(result.rows[0]?.email).toBe('lead@acme.com');
    expect(result.rows[0]?.company.name).toBe('Acme');
    expect(result.rows[0]?.company.pole_code).toBe('AUDIO');
    expect(result.rows[0]?.brevo_contact_id).toBe('42');
  });

  it('listContactsPaginated returns empty rows on DB error', async () => {
    mockServerClient({
      contacts: { error: { message: 'boom' }, data: null, count: 0 },
    });
    const { listContactsPaginated } = await import('./admin-queries');
    const result = await listContactsPaginated({});
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('getContactsKpis returns 6 counters', async () => {
    // The mock returns count for every contacts:* call.
    mockServerClient({
      contacts: { count: 10, error: null },
    });
    const { getContactsKpis } = await import('./admin-queries');
    const kpis = await getContactsKpis();
    expect(kpis.total).toBe(10);
    expect(kpis.primary).toBe(10);
    expect(kpis.brevoSynced).toBe(10);
    expect(kpis.marketingOptIn).toBe(10);
    expect(kpis.lifecycleEnabled).toBe(10);
    expect(kpis.withoutEmail).toBe(10);
  });

  // P5.x.ProspectionIndicators tests

  it('listContactsPaginated enriches is_prospect=true and prospect_owner when contact is a prospect', async () => {
    mockServerClient({
      contacts: {
        data: [
          {
            id: 'c-1',
            email: 'prospect@acme.com',
            first_name: 'Bob',
            last_name: 'Prospect',
            phone: null,
            role: null,
            is_primary: true,
            language: 'FR',
            marketing_consent: false,
            lifecycle_emails_enabled: false,
            email_deliverability_status: 'unknown',
            brevo_contact_id: null,
            last_synced_brevo_at: null,
            created_at: '2026-05-14T00:00:00Z',
            company: { id: 'co-1', name: 'Acme', pole_id: null, pole: null },
          },
        ],
        count: 1,
      },
      prospects: {
        data: [{ primary_contact_id: 'c-1', owner: [{ full_name: 'Alice Owner' }] }],
        error: null,
      },
    });
    const { listContactsPaginated } = await import('./admin-queries');
    const result = await listContactsPaginated({});
    expect(result.rows[0]?.is_prospect).toBe(true);
    expect(result.rows[0]?.prospect_owner?.full_name).toBe('Alice Owner');
  });

  it('listContactsPaginated enriches is_prospect=false when no matching prospect', async () => {
    mockServerClient({
      contacts: {
        data: [
          {
            id: 'c-2',
            email: 'noprospect@acme.com',
            first_name: 'Carol',
            last_name: 'None',
            phone: null,
            role: null,
            is_primary: false,
            language: 'EN',
            marketing_consent: false,
            lifecycle_emails_enabled: false,
            email_deliverability_status: 'unknown',
            brevo_contact_id: null,
            last_synced_brevo_at: null,
            created_at: '2026-05-14T00:00:00Z',
            company: { id: 'co-2', name: 'Beta', pole_id: null, pole: null },
          },
        ],
        count: 1,
      },
      prospects: { data: [], error: null },
    });
    const { listContactsPaginated } = await import('./admin-queries');
    const result = await listContactsPaginated({});
    expect(result.rows[0]?.is_prospect).toBe(false);
    expect(result.rows[0]?.prospect_owner).toBeNull();
  });

  it('listContactsPaginated with prospectFilter=prospect_only returns empty when no prospects exist', async () => {
    mockServerClient({
      contacts: {
        data: [
          {
            id: 'c-3',
            email: 'any@acme.com',
            first_name: null,
            last_name: null,
            phone: null,
            role: null,
            is_primary: false,
            language: 'FR',
            marketing_consent: false,
            lifecycle_emails_enabled: false,
            email_deliverability_status: 'unknown',
            brevo_contact_id: null,
            last_synced_brevo_at: null,
            created_at: '2026-05-14T00:00:00Z',
            company: { id: 'co-3', name: 'Gamma', pole_id: null, pole: null },
          },
        ],
        count: 1,
      },
      prospects: { data: [], error: null },
    });
    const { listContactsPaginated } = await import('./admin-queries');
    const result = await listContactsPaginated({ prospectFilter: 'prospect_only' });
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('listContactsForCompany returns array sorted (server-side .order chain called)', async () => {
    const mock = mockServerClient({
      contacts: {
        data: [
          {
            id: 'c-1',
            company_id: 'co-1',
            email: 'a@b.com',
            first_name: null,
            last_name: null,
            phone: null,
            role: null,
            is_primary: true,
            language: 'FR',
            marketing_consent: true,
            lifecycle_emails_enabled: true,
            email_deliverability_status: 'unknown',
            brevo_contact_id: null,
            last_synced_brevo_at: null,
            created_at: '2026-05-14',
          },
        ],
        error: null,
      },
    });
    const { listContactsForCompany } = await import('./admin-queries');
    const rows = await listContactsForCompany('co-1');
    expect(rows.length).toBe(1);
    // Verify the .order chain was hit twice (is_primary desc, then created_at asc)
    const contactsCall = mock.calls.find((c) => c.table === 'contacts');
    const orderOps = contactsCall?.steps.filter((s) => s.op === 'order') ?? [];
    expect(orderOps.length).toBe(2);
    expect(orderOps[0]?.args[0]).toBe('is_primary');
    expect(orderOps[1]?.args[0]).toBe('created_at');
  });
});
