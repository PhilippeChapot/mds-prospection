/**
 * @vitest-environment node
 *
 * P5.x.17-bis — tests requireEspaceExposantSession.
 *
 * Garanties testees :
 *   - cookie absent       -> redirect (NEXT_REDIRECT exception)
 *   - JWT invalide        -> redirect avec error=invalid
 *   - JWT expire          -> redirect avec error=expired
 *   - JWT valide          -> retourne { prospectId } sans throw
 *   - aucune query DB n'est faite (validation pure cookie+JWT)
 *
 * On mock next/headers + next/navigation + jwt verify pour isoler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let cookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (_name: string) => (cookieValue ? { value: cookieValue } : undefined),
    }),
}));

const redirectSpy = vi.fn((_url: string): never => {
  // Replique le comportement de redirect() : throw une exception pour
  // arreter la suite du flow.
  const err = new Error('NEXT_REDIRECT');
  // @ts-expect-error -- propriete attendue par Next.js sur l'exception
  err.digest = `NEXT_REDIRECT;${_url}`;
  throw err;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectSpy(url),
}));

// Mock JWT verify pour controller le resultat (valide/expired/invalid).
let jwtBehavior: 'valid' | 'expired' | 'invalid' = 'valid';
let jwtKind: 'prospect' | 'contact' = 'prospect';

vi.mock('./jwt', async (orig) => {
  const actual = (await orig()) as typeof import('./jwt');
  return {
    ...actual,
    verifySessionToken: vi.fn(async (_token: string) => {
      if (jwtBehavior === 'expired') {
        throw new actual.EspaceExposantTokenError('expired');
      }
      if (jwtBehavior === 'invalid') {
        throw new actual.EspaceExposantTokenError('invalid');
      }
      return {
        prospectId: jwtKind === 'contact' ? 'contact-uuid-1' : 'prospect-uuid-1',
        type: 'session' as const,
        jti: 'jti-1',
        expiresAt: new Date(Date.now() + 1_000_000),
        kind: jwtKind,
      };
    }),
  };
});

// P8.2 : requireContactSession fait un lookup DB pour resoudre prospect
// (kind=prospect) ou contact (kind=contact). Mock contextualise par table.
let prospectLookupResult: { id: string; primary_contact_id: string | null } | null = {
  id: 'prospect-uuid-1',
  primary_contact_id: 'contact-uuid-1',
};
let contactLookupResult: { id: string; prospects: Array<{ id: string; status: string }> } | null = {
  id: 'contact-uuid-1',
  prospects: [],
};

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => {
          if (table === 'prospects') {
            return Promise.resolve({ data: prospectLookupResult, error: null });
          }
          if (table === 'contacts') {
            return Promise.resolve({ data: contactLookupResult, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  }),
}));

beforeEach(() => {
  cookieValue = 'fake-token';
  jwtBehavior = 'valid';
  jwtKind = 'prospect';
  prospectLookupResult = { id: 'prospect-uuid-1', primary_contact_id: 'contact-uuid-1' };
  contactLookupResult = { id: 'contact-uuid-1', prospects: [] };
  redirectSpy.mockClear();
});

describe('requireEspaceExposantSession (P5.x.17-bis)', () => {
  it('cookie absent -> redirect /espace-exposant?error=expired', async () => {
    cookieValue = undefined;
    const { requireEspaceExposantSession } = await import('./session');
    await expect(requireEspaceExposantSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-exposant?error=expired');
  });

  it('JWT expire -> redirect avec error=expired', async () => {
    jwtBehavior = 'expired';
    const { requireEspaceExposantSession } = await import('./session');
    await expect(requireEspaceExposantSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-exposant?error=expired');
  });

  it('JWT invalide -> redirect avec error=invalid', async () => {
    jwtBehavior = 'invalid';
    const { requireEspaceExposantSession } = await import('./session');
    await expect(requireEspaceExposantSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-exposant?error=invalid');
  });

  it('JWT valide -> retourne prospectId sans throw', async () => {
    const { requireEspaceExposantSession } = await import('./session');
    const result = await requireEspaceExposantSession('fr');
    expect(result).toEqual({ prospectId: 'prospect-uuid-1' });
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it("respecte le locale dans l'URL de redirect", async () => {
    cookieValue = undefined;
    const { requireEspaceExposantSession } = await import('./session');
    await expect(requireEspaceExposantSession('en')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/en/espace-exposant?error=expired');
  });
});

// P8.2-redirect-loop : tests dedies anti-boucle.
describe('requireContactSession (P8.2-redirect-loop)', () => {
  it('JWT kind=prospect valide + primary_contact resolu -> ne redirige pas', async () => {
    // Le mock supabase ci-dessus retourne primary_contact_id='contact-uuid-1'.
    const { requireContactSession } = await import('./session');
    const result = await requireContactSession('fr');
    expect(result.contactId).toBe('contact-uuid-1');
    expect(result.prospectId).toBe('prospect-uuid-1');
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('requireEspaceExposantSession sans prospect -> redirect vers /dashboard/profil (PAS /dashboard, anti-boucle)', async () => {
    // Scenario contact simple P8.2 : JWT kind='contact' (sub=contactId),
    // aucun prospect actif lie -> session.prospectId est null cote helper
    // -> requireEspaceExposantSession doit rediriger vers /dashboard/profil
    // (safe), PAS /dashboard (qui creerait une boucle root->stand->root->
    // stand via loadDashboardData).
    jwtKind = 'contact';
    contactLookupResult = { id: 'contact-uuid-1', prospects: [] }; // contact simple
    const { requireEspaceExposantSession } = await import('./session');
    await expect(requireEspaceExposantSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-exposant/dashboard/profil');
    expect(redirectSpy).not.toHaveBeenCalledWith('/fr/espace-exposant/dashboard');
  });

  it('requireContactSession kind=contact + sans prospect -> ne redirige pas (always-on)', async () => {
    // Contact simple : il doit pouvoir charger /dashboard et /dashboard/profil
    // sans aucun redirect. C'est la garantie anti-boucle.
    jwtKind = 'contact';
    contactLookupResult = { id: 'contact-uuid-1', prospects: [] };
    const { requireContactSession } = await import('./session');
    const result = await requireContactSession('fr');
    expect(result.contactId).toBe('contact-uuid-1');
    expect(result.prospectId).toBeNull();
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});
