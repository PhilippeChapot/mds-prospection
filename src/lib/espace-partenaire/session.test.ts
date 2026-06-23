/**
 * @vitest-environment node
 *
 * P5.x.17-bis — tests requireEspacePartenaireSession.
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
        throw new actual.EspacePartenaireTokenError('expired');
      }
      if (jwtBehavior === 'invalid') {
        throw new actual.EspacePartenaireTokenError('invalid');
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
// P11.x.MultiPartnerContentResolution — résolution par company via grants.
let grantResult: { company_id: string } | null = null;
let seasonResult: { id: string } | null = { id: 'season-1' };
let companyProspectResult: { id: string } | null = null;
let primaryProspectResult: { id: string } | null = null;

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        is: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => {
          if (table === 'partner_access_grants') {
            return Promise.resolve({ data: grantResult, error: null });
          }
          if (table === 'seasons') {
            return Promise.resolve({ data: seasonResult, error: null });
          }
          if (table === 'contacts') {
            return Promise.resolve({ data: contactLookupResult, error: null });
          }
          if (table === 'prospects') {
            // Legacy (kind=prospect) : lookup par id.
            if (filters.id) return Promise.resolve({ data: prospectLookupResult, error: null });
            // P11.x : prospect de la company (grant).
            if (filters.company_id)
              return Promise.resolve({ data: companyProspectResult, error: null });
            // Fallback legacy : prospect dont le contact est primary.
            if (filters.primary_contact_id)
              return Promise.resolve({ data: primaryProspectResult, error: null });
            return Promise.resolve({ data: null, error: null });
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
  grantResult = null;
  seasonResult = { id: 'season-1' };
  companyProspectResult = null;
  primaryProspectResult = null;
  redirectSpy.mockClear();
});

describe('requireEspacePartenaireSession (P5.x.17-bis)', () => {
  it('cookie absent -> redirect /espace-partenaire?error=expired', async () => {
    cookieValue = undefined;
    const { requireEspacePartenaireSession } = await import('./session');
    await expect(requireEspacePartenaireSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-partenaire?error=expired');
  });

  it('JWT expire -> redirect avec error=expired', async () => {
    jwtBehavior = 'expired';
    const { requireEspacePartenaireSession } = await import('./session');
    await expect(requireEspacePartenaireSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-partenaire?error=expired');
  });

  it('JWT invalide -> redirect avec error=invalid', async () => {
    jwtBehavior = 'invalid';
    const { requireEspacePartenaireSession } = await import('./session');
    await expect(requireEspacePartenaireSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-partenaire?error=invalid');
  });

  it('JWT valide -> retourne prospectId sans throw', async () => {
    const { requireEspacePartenaireSession } = await import('./session');
    const result = await requireEspacePartenaireSession('fr');
    expect(result).toEqual({ prospectId: 'prospect-uuid-1' });
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it("respecte le locale dans l'URL de redirect", async () => {
    cookieValue = undefined;
    const { requireEspacePartenaireSession } = await import('./session');
    await expect(requireEspacePartenaireSession('en')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/en/espace-partenaire?error=expired');
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

  it('requireEspacePartenaireSession sans prospect -> redirect vers /dashboard/profil (PAS /dashboard, anti-boucle)', async () => {
    // Scenario contact simple P8.2 : JWT kind='contact' (sub=contactId),
    // aucun prospect actif lie -> session.prospectId est null cote helper
    // -> requireEspacePartenaireSession doit rediriger vers /dashboard/profil
    // (safe), PAS /dashboard (qui creerait une boucle root->stand->root->
    // stand via loadDashboardData).
    jwtKind = 'contact';
    contactLookupResult = { id: 'contact-uuid-1', prospects: [] }; // contact simple
    const { requireEspacePartenaireSession } = await import('./session');
    await expect(requireEspacePartenaireSession('fr')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/fr/espace-partenaire/dashboard/profil');
    expect(redirectSpy).not.toHaveBeenCalledWith('/fr/espace-partenaire/dashboard');
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

  it('P11.x : contact secondaire avec grant company -> résout le prospect de la company', async () => {
    // Sophie = contact secondaire (PAS primary_contact), mais grant actif sur
    // la company qui a un prospect visible -> elle voit le prospect du dossier.
    jwtKind = 'contact'; // sub = 'contact-uuid-1' (Sophie), pas le primary du prospect
    contactLookupResult = { id: 'contact-uuid-1', prospects: [] };
    grantResult = { company_id: 'company-winmedia' };
    companyProspectResult = { id: 'prospect-winmedia' };
    primaryProspectResult = { id: 'ne-doit-pas-etre-utilise' };
    const { requireContactSession } = await import('./session');
    const result = await requireContactSession('fr');
    expect(result.contactId).toBe('contact-uuid-1');
    expect(result.prospectId).toBe('prospect-winmedia');
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});
