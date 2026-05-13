/**
 * @vitest-environment node
 *
 * P5.x.16 + P5.x.16-bis — smoke tests GET /i/[companyId].
 *
 * Cas couverts :
 *   - inconnu (ni slug ni UUID) -> 302 mediadays.net gracieux, sans insert.
 *   - slug nominal              -> 302 + insert avec ip_hash SHA256 +
 *     user_agent + referrer. company_id resolu via lookup slug.
 *   - UUID retrocompat          -> 302 + insert. Le lookup slug echoue
 *     puis le fallback UUID prend le relais (matcher regex UUID).
 *   - IP absente                -> hash deterministe sur "0.0.0.0".
 *   - non-UUID inconnu          -> 302 gracieux, pas de fallback UUID
 *     (regex UUID rejette).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

type FakeCompany = { id: string };

// Maps slug -> company (lookup #1) + id -> company (lookup #2)
const companiesBySlug = new Map<string, FakeCompany>();
const companiesById = new Map<string, FakeCompany>();
const insertCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: () => ({
      // chain pour select (companies) — discrimine sur `.eq(col, val)`
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => {
            const data =
              col === 'slug'
                ? (companiesBySlug.get(val) ?? null)
                : col === 'id'
                  ? (companiesById.get(val) ?? null)
                  : null;
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
      // chain pour insert (visitor_invitations_clicks)
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push(payload);
        return {
          then: (cb: (res: { error: null }) => void) => {
            cb({ error: null });
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  }),
}));

beforeEach(() => {
  companiesBySlug.clear();
  companiesById.clear();
  insertCalls.length = 0;
});

describe('GET /i/[companyId] (P5.x.16 + P5.x.16-bis tracking redirect)', () => {
  it('identifiant inconnu (ni slug ni UUID) -> 302 gracieux, sans insert', async () => {
    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/ghost', {
      headers: { 'user-agent': 'TestUA' },
    });
    const res = await GET(req, { params: Promise.resolve({ companyId: 'ghost' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('mediadays.net');
    expect(insertCalls).toHaveLength(0);
  });

  it('slug nominal -> 302 + insert avec ip_hash SHA256', async () => {
    companiesBySlug.set('21-juin-production', { id: 'cmp-uuid-1' });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/21-juin-production', {
      headers: {
        'user-agent': 'Mozilla/5.0 Test',
        'x-forwarded-for': '203.0.113.42, 10.0.0.1',
        referer: 'https://example.com/email',
      },
    });
    const res = await GET(req, {
      params: Promise.resolve({ companyId: '21-juin-production' }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://mediadays.net/');

    expect(insertCalls).toHaveLength(1);
    const payload = insertCalls[0];
    // company_id = UUID resolu, PAS le slug.
    expect(payload.company_id).toBe('cmp-uuid-1');
    expect(payload.user_agent).toBe('Mozilla/5.0 Test');
    expect(payload.referrer).toBe('https://example.com/email');
    const expectedHash = createHash('sha256').update('203.0.113.42').digest('hex');
    expect(payload.ip_hash).toBe(expectedHash);
  });

  it('UUID retrocompat -> 302 + insert (fallback id apres slug miss)', async () => {
    const uuid = '71eb7b48-cb95-4973-9205-5b50bdcc33e1';
    // Pas de slug correspondant : on s'assure que le lookup par id prend le relais.
    companiesById.set(uuid, { id: uuid });

    const { GET } = await import('./route');
    const req = new NextRequest(`http://localhost/i/${uuid}`);
    const res = await GET(req, { params: Promise.resolve({ companyId: uuid }) });

    expect(res.status).toBe(302);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].company_id).toBe(uuid);
  });

  it('IP absente -> hash fallback sur "0.0.0.0"', async () => {
    companiesBySlug.set('acme', { id: 'cmp-2' });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/acme');
    await GET(req, { params: Promise.resolve({ companyId: 'acme' }) });

    expect(insertCalls).toHaveLength(1);
    const expectedHash = createHash('sha256').update('0.0.0.0').digest('hex');
    expect(insertCalls[0].ip_hash).toBe(expectedHash);
  });

  it('non-UUID inconnu -> pas de fallback id, redirect gracieux', async () => {
    // companiesBySlug vide, identifier non-UUID -> regex rejette le fallback.
    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/not-a-uuid-and-not-a-slug');
    const res = await GET(req, {
      params: Promise.resolve({ companyId: 'not-a-uuid-and-not-a-slug' }),
    });

    expect(res.status).toBe(302);
    expect(insertCalls).toHaveLength(0);
  });
});
