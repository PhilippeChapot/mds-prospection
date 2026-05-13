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
        prospectId: 'prospect-uuid-1',
        type: 'session' as const,
        jti: 'jti-1',
        expiresAt: new Date(Date.now() + 1_000_000),
      };
    }),
  };
});

beforeEach(() => {
  cookieValue = 'fake-token';
  jwtBehavior = 'valid';
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
