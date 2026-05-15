/**
 * @vitest-environment node
 *
 * P5.x.24 — tests GET /api/admin/contacts/search.
 *
 * Validation :
 *   - non admin/sales → 403
 *   - sans q → renvoie la liste (jusqu'à limit) ordonnée par primary + email
 *   - avec company_id → applique .eq('company_id', x)
 *   - avec q court (<2 chars) → pas de filtre ilike (tous remontent)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_BACKUP = { ...process.env };

interface QueryRecord {
  filters: Array<{ op: string; args: unknown[] }>;
}

function mockEnv(opts: {
  profile?: { id: string; role: 'admin' | 'sales' | 'viewer'; email: string } | null;
  contacts?: Array<Record<string, unknown>>;
}) {
  const record: QueryRecord = { filters: [] };

  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve(opts.profile ?? { id: 'u', role: 'admin', email: 'a@b' }),
  }));

  // Le chain est thenable (le route fait : let q = .from().select().order().limit() ;
  // puis q = q.eq() / q = q.or() ; puis await q). Donc chaque opérateur (eq, or,
  // order, limit, select) doit retourner un objet qui supporte les autres
  // opérateurs AINSI que `then` (await).
  const builder: Record<string, unknown> = {};
  const makeChain = () => {
    const c: Record<string, unknown> = {};
    c.select = () => makeChain();
    c.eq = (col: string, val: unknown) => {
      record.filters.push({ op: 'eq', args: [col, val] });
      return makeChain();
    };
    c.or = (filter: unknown) => {
      record.filters.push({ op: 'or', args: [filter] });
      return makeChain();
    };
    c.order = () => makeChain();
    c.limit = () => makeChain();
    // Thenable : trigger la résolution lors du await
    c.then = (resolve: (r: unknown) => void) => resolve({ data: opts.contacts ?? [], error: null });
    return c;
  };
  builder.from = () => makeChain();

  vi.doMock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () => Promise.resolve(builder),
  }));

  return { record };
}

describe('GET /api/admin/contacts/search (P5.x.24)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.assign(process.env, ENV_BACKUP);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects non-admin/sales role with 403', async () => {
    mockEnv({ profile: { id: 'u', role: 'viewer' as 'admin', email: 'v@b' } });
    const { GET } = await import('./route');
    const req = new Request('http://localhost/api/admin/contacts/search?q=alice');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('returns contacts mapped with company_name', async () => {
    mockEnv({
      contacts: [
        {
          id: 'c1',
          email: 'alice@acme.com',
          first_name: 'Alice',
          last_name: 'A',
          phone: null,
          role: 'CEO',
          is_primary: true,
          language: 'FR',
          company_id: 'co1',
          company: { id: 'co1', name: 'Acme', primary_domain: 'acme.com' },
        },
      ],
    });
    const { GET } = await import('./route');
    const req = new Request('http://localhost/api/admin/contacts/search?q=alice');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contacts).toHaveLength(1);
    expect(json.contacts[0].email).toBe('alice@acme.com');
    expect(json.contacts[0].company_name).toBe('Acme');
  });

  it('applies company_id filter when query param present', async () => {
    const { record } = mockEnv({ contacts: [] });
    const { GET } = await import('./route');
    const companyId = '5402eb3e-f57d-41aa-b1ac-04a1ebc9f8af';
    const req = new Request(
      `http://localhost/api/admin/contacts/search?q=ali&company_id=${companyId}`,
    );
    await GET(req);
    const eqCall = record.filters.find((f) => f.op === 'eq' && f.args[0] === 'company_id');
    expect(eqCall).toBeDefined();
    expect(eqCall?.args[1]).toBe(companyId);
  });

  it('skips ilike .or() when q is too short (<2 chars)', async () => {
    const { record } = mockEnv({ contacts: [] });
    const { GET } = await import('./route');
    const req = new Request('http://localhost/api/admin/contacts/search?q=a');
    await GET(req);
    const orCall = record.filters.find((f) => f.op === 'or');
    expect(orCall).toBeUndefined();
  });
});
