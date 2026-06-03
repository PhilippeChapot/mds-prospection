/**
 * @vitest-environment node
 *
 * P5.x.16-bis — tests updateCompanySlugAction.
 *
 * Cas couverts :
 *   - pas de session         -> unauthorized
 *   - slug trop court (<3)   -> too_short
 *   - slug trop long (>32)   -> too_long
 *   - format invalide        -> invalid_format
 *   - slug deja pris         -> slug_taken
 *   - happy path             -> ok + revalidate + UPDATE companies.slug
 *
 * On mock cookies + JWT verify + Supabase pour isoler la logique.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let cookieValue: string | undefined = 'fake-session-token';
let verifyResolves: { prospectId: string } | null = { prospectId: 'prospect-1' };
let prospectCompanyId: string | null = 'cmp-1';
let clashingCompanyId: string | null = null;
const updateCalls: Array<{ slug: string; whereId: string }> = [];
const revalidateCalls: string[] = [];

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (cookieValue ? { value: cookieValue } : undefined),
    }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => {
    revalidateCalls.push(p);
  },
}));

vi.mock('@/lib/espace-partenaire/jwt', () => ({
  ESPACE_EXPOSANT_SESSION_COOKIE: 'espace_partenaire_session',
  verifySessionToken: () => {
    if (!verifyResolves) throw new Error('invalid');
    return Promise.resolve(verifyResolves);
  },
  EspacePartenaireTokenError: class extends Error {},
}));

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === 'prospects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: prospectCompanyId ? { company_id: prospectCompanyId } : null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'companies') {
        return {
          // Check unicite : SELECT id WHERE slug=? AND id != ?
          select: () => ({
            eq: () => ({
              neq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: clashingCompanyId ? { id: clashingCompanyId } : null,
                    error: null,
                  }),
              }),
            }),
          }),
          update: (patch: { slug: string }) => ({
            eq: (_col: string, val: string) => {
              updateCalls.push({ slug: patch.slug, whereId: val });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`Unexpected from('${table}')`);
    },
  }),
}));

beforeEach(() => {
  cookieValue = 'fake-session-token';
  verifyResolves = { prospectId: 'prospect-1' };
  prospectCompanyId = 'cmp-1';
  clashingCompanyId = null;
  updateCalls.length = 0;
  revalidateCalls.length = 0;
});

describe('updateCompanySlugAction (P5.x.16-bis)', () => {
  it('pas de cookie session -> unauthorized', async () => {
    cookieValue = undefined;
    const { updateCompanySlugAction } = await import('./actions');
    const res = await updateCompanySlugAction({ slug: 'foo' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('unauthorized');
  });

  it('slug trop court -> too_short', async () => {
    const { updateCompanySlugAction } = await import('./actions');
    const res = await updateCompanySlugAction({ slug: 'ab' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('too_short');
  });

  it('slug trop long -> too_long', async () => {
    const { updateCompanySlugAction } = await import('./actions');
    const tooLong = 'a'.repeat(33);
    const res = await updateCompanySlugAction({ slug: tooLong });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('too_long');
  });

  it('format invalide (majuscules) -> invalid_format', async () => {
    const { updateCompanySlugAction } = await import('./actions');
    // Le schema trim+toLowerCase normalise les majuscules avant le regex,
    // donc "FOO" devient "foo" et passe. On teste un format vraiment
    // invalide : double tiret + caracteres specials.
    const res = await updateCompanySlugAction({ slug: 'foo--bar' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_format');
  });

  it('tiret en debut/fin -> invalid_format', async () => {
    const { updateCompanySlugAction } = await import('./actions');
    const res = await updateCompanySlugAction({ slug: '-foo' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_format');
  });

  it('slug deja pris par une autre company -> slug_taken', async () => {
    clashingCompanyId = 'other-cmp';
    const { updateCompanySlugAction } = await import('./actions');
    const res = await updateCompanySlugAction({ slug: '21-juin-production' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('slug_taken');
    expect(updateCalls).toHaveLength(0);
  });

  it('happy path -> ok + UPDATE + revalidatePath FR + EN', async () => {
    const { updateCompanySlugAction } = await import('./actions');
    const res = await updateCompanySlugAction({ slug: '21-juin-production' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.slug).toBe('21-juin-production');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({ slug: '21-juin-production', whereId: 'cmp-1' });
    expect(revalidateCalls).toContain('/fr/espace-partenaire/dashboard');
    expect(revalidateCalls).toContain('/en/espace-partenaire/dashboard');
  });
});
