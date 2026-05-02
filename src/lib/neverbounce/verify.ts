/**
 * NeverBounce single-check API.
 * Doc : https://developers.neverbounce.com/reference/single-check
 *
 * Politique P3 :
 *   - 'valid'    -> OK
 *   - 'catchall' -> OK (boite catch-all generique, on accepte)
 *   - autres     -> rejette
 *
 * En dev (NEVERBOUNCE_API_KEY non defini), on bypass tout en retournant
 * { result: 'valid' } pour debloquer le local.
 */

const NEVERBOUNCE_BASE = 'https://api.neverbounce.com/v4';

export type NeverBounceResult = 'valid' | 'invalid' | 'disposable' | 'catchall' | 'unknown';

export interface NeverBounceCheckResult {
  result: NeverBounceResult;
  // Code interne NeverBounce (0..5).
  code: number;
  // Coute un credit. On compte les checks pour le quota.
  creditsUsed?: number;
}

const RESULT_BY_CODE: Record<number, NeverBounceResult> = {
  0: 'valid',
  1: 'invalid',
  2: 'disposable',
  3: 'catchall',
  4: 'unknown',
};

export async function verifyEmailDeliverability(email: string): Promise<NeverBounceCheckResult> {
  const apiKey = process.env.NEVERBOUNCE_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      // Echec dur en prod : on ne veut pas accepter d'inscriptions sans verif.
      throw new Error('NEVERBOUNCE_API_KEY is not configured.');
    }
    return { result: 'valid', code: 0 };
  }

  const url = new URL(`${NEVERBOUNCE_BASE}/single/check`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('email', email);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: 'GET' });
  } catch {
    // Reseau KO -> on log mais on ne bloque pas l'inscription (best effort).
    return { result: 'unknown', code: 4 };
  }

  if (!response.ok) {
    return { result: 'unknown', code: 4 };
  }

  const data = (await response.json().catch(() => ({}))) as {
    status?: string;
    result?: NeverBounceResult;
    result_int?: number;
    credits_info?: { paid_credits_remaining?: number };
  };

  if (data.status !== 'success' || typeof data.result_int !== 'number') {
    return { result: 'unknown', code: 4 };
  }

  const result = data.result ?? RESULT_BY_CODE[data.result_int] ?? 'unknown';
  return { result, code: data.result_int };
}

/**
 * Politique P3 : seuls 'valid' et 'catchall' passent.
 */
export function isDeliverable(result: NeverBounceResult): boolean {
  return result === 'valid' || result === 'catchall';
}
