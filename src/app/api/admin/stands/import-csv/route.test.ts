/**
 * @vitest-environment node
 *
 * P6.x.2a-bis — tests POST /api/admin/stands/import-csv.
 *
 * Couvre :
 *   - 403 si role !== admin
 *   - 400 si body vide
 *   - happy path : upsert rows valides, errors retournés pour rows invalides
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upsertCalls: Array<{ rows: Array<Record<string, unknown>>; opts: Record<string, unknown> }> =
  [];

function mockEnv(opts: { role?: 'admin' | 'sales' | 'viewer' } = {}) {
  vi.doMock('@/lib/supabase/auth-helpers', () => ({
    requireAdminProfile: () =>
      Promise.resolve({ id: 'u', role: opts.role ?? 'admin', email: 'a@b' }),
  }));
  vi.doMock('@/lib/supabase/service', () => ({
    getSupabaseServiceClient: () => ({
      from: () => ({
        upsert: (rows: Array<Record<string, unknown>>, o: Record<string, unknown>) => {
          upsertCalls.push({ rows, opts: o });
          return {
            select: () =>
              Promise.resolve({ data: rows.map((_r, i) => ({ id: `s-${i}` })), error: null }),
          };
        },
      }),
    }),
  }));
}

describe('POST /api/admin/stands/import-csv (P6.x.2a-bis)', () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('refuse si role=sales (admin only)', async () => {
    mockEnv({ role: 'sales' });
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: 'number,salle,taille_m2\nA0,le_notre,6' }),
    );
    expect(res.status).toBe(403);
    expect(upsertCalls).toHaveLength(0);
  });

  it('400 si body vide', async () => {
    mockEnv();
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x', { method: 'POST', body: '' }));
    expect(res.status).toBe(400);
  });

  it('happy path : upsert rows valides, errors retournés pour rows invalides', async () => {
    mockEnv();
    const csv =
      'number,salle,taille_m2,pole_recommended,status\n' +
      'A0,le_notre,6,AUDIO_RADIO,libre\n' +
      'A1,le_notre,9,AUDIO_RADIO,bloque\n' +
      'BAD,le_notre,not_a_number,AUDIO_RADIO,libre\n';
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x', { method: 'POST', body: csv }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { upserted: number; errors: Array<{ row: number }> };
    expect(json.upserted).toBe(2);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].row).toBe(4); // 3 data rows + 1 header = 4th line
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toHaveLength(2);
    expect(upsertCalls[0].opts).toMatchObject({ onConflict: 'salle,number' });
  });

  it('pole_recommended vide → null', async () => {
    mockEnv();
    const csv = 'number,salle,taille_m2,pole_recommended,status\nA0,le_notre,6,,libre\n';
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x', { method: 'POST', body: csv }));
    expect(res.status).toBe(200);
    expect(upsertCalls[0].rows[0].pole_recommended).toBeNull();
  });
});
