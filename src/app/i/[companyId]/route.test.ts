/**
 * @vitest-environment node
 *
 * P5.x.16 — smoke tests GET /i/[companyId].
 *
 * Cas couverts :
 *   - company introuvable -> 302 redirect gracieux vers mediadays.net,
 *     pas d'insert dans visitor_invitations_clicks.
 *   - company OK          -> 302 redirect mediadays.net + insert avec
 *     ip_hash (SHA256) + user_agent + referrer.
 *   - IP absente          -> hash deterministe sur "0.0.0.0" (fallback).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

type FakeCompany = { id: string } | null;

let fakeCompany: FakeCompany = null;
const insertCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (_table: string) => ({
      // chain pour select (companies)
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: fakeCompany, error: null }),
        }),
      }),
      // chain pour insert (visitor_invitations_clicks)
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push(payload);
        // thenable pour `.then(({error}) => ...)` du fire-and-forget
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
  fakeCompany = null;
  insertCalls.length = 0;
});

describe('GET /i/[companyId] (P5.x.16 invitation tracking redirect)', () => {
  it('company introuvable -> 302 mediadays.net (gracieux) sans insert', async () => {
    fakeCompany = null;
    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/ghost', {
      headers: { 'user-agent': 'TestUA' },
    });
    const res = await GET(req, { params: Promise.resolve({ companyId: 'ghost' }) });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('mediadays.net');
    expect(insertCalls).toHaveLength(0);
  });

  it('company OK + IP fournie -> 302 mediadays.net + insert avec ip_hash SHA256', async () => {
    fakeCompany = { id: 'cmp-1' };
    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/cmp-1', {
      headers: {
        'user-agent': 'Mozilla/5.0 Test',
        'x-forwarded-for': '203.0.113.42, 10.0.0.1',
        referer: 'https://example.com/email',
      },
    });
    const res = await GET(req, { params: Promise.resolve({ companyId: 'cmp-1' }) });

    expect(res.status).toBe(302);
    // NextResponse.redirect normalise l'URL et ajoute le trailing slash.
    expect(res.headers.get('location')).toBe('https://mediadays.net/');

    // Insert appele 1x avec les bonnes valeurs.
    expect(insertCalls).toHaveLength(1);
    const payload = insertCalls[0];
    expect(payload.company_id).toBe('cmp-1');
    expect(payload.user_agent).toBe('Mozilla/5.0 Test');
    expect(payload.referrer).toBe('https://example.com/email');

    // ip_hash = SHA256("203.0.113.42") (premiere IP de x-forwarded-for).
    const expectedHash = createHash('sha256').update('203.0.113.42').digest('hex');
    expect(payload.ip_hash).toBe(expectedHash);
  });

  it('IP absente -> hash fallback sur "0.0.0.0"', async () => {
    fakeCompany = { id: 'cmp-2' };
    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/i/cmp-2');
    await GET(req, { params: Promise.resolve({ companyId: 'cmp-2' }) });

    expect(insertCalls).toHaveLength(1);
    const expectedHash = createHash('sha256').update('0.0.0.0').digest('hex');
    expect(insertCalls[0].ip_hash).toBe(expectedHash);
  });
});
