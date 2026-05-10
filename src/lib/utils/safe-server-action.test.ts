/**
 * P5.x.7.pre — tests safeServerAction wrapper.
 *
 * Couvre :
 *   - resolved value retournee tel quel
 *   - vraie erreur -> toast.error + return undefined
 *   - signal NEXT_REDIRECT -> re-throw (pour que Next.js gere le redirect)
 *   - errorMessage custom (string ou options)
 *   - onError override
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

describe('safeServerAction (P5.x.7.pre)', () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('action OK -> retourne la valeur, pas de toast', async () => {
    const { safeServerAction } = await import('./safe-server-action');
    const result = await safeServerAction(async () => 'ok');
    expect(result).toBe('ok');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('action throw vraie erreur -> toast + undefined', async () => {
    const { safeServerAction } = await import('./safe-server-action');
    const result = await safeServerAction(async () => {
      throw new Error('boom DB');
    }, 'Erreur lors de la suppression');
    expect(result).toBeUndefined();
    expect(toastErrorMock).toHaveBeenCalledOnce();
    // Sonner recoit le message de l'erreur (boom DB) car non vide.
    expect(toastErrorMock).toHaveBeenCalledWith('boom DB');
  });

  it('errorMessage utilise quand error.message vide ou non-Error', async () => {
    const { safeServerAction } = await import('./safe-server-action');
    await safeServerAction(async () => {
       
      throw 'string-error-not-an-Error';
    }, 'Fallback message');
    expect(toastErrorMock).toHaveBeenCalledWith('Fallback message');
  });

  it('signal NEXT_REDIRECT -> re-throw, pas de toast', async () => {
    const { safeServerAction } = await import('./safe-server-action');
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/admin/prospects;307;',
    });
    await expect(
      safeServerAction(async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('digest sans NEXT_REDIRECT prefix -> traite comme erreur normale', async () => {
    const { safeServerAction } = await import('./safe-server-action');
    const err = Object.assign(new Error('other'), { digest: 'OTHER_DIGEST' });
    const result = await safeServerAction(async () => {
      throw err;
    });
    expect(result).toBeUndefined();
    expect(toastErrorMock).toHaveBeenCalledOnce();
  });

  it('options.onError override le toast par defaut', async () => {
    const onError = vi.fn();
    const { safeServerAction } = await import('./safe-server-action');
    await safeServerAction(
      async () => {
        throw new Error('boom');
      },
      { onError, logToConsole: false },
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('options.logToConsole=false silencie console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { safeServerAction } = await import('./safe-server-action');
    await safeServerAction(
      async () => {
        throw new Error('boom');
      },
      { logToConsole: false },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
