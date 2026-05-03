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

/**
 * Mapping result string -> code interne. Utilise pour stocker un code
 * stable cote DB (`neverbounce_result` colonne) si on veut filtrer plus
 * tard. La doc v4 ne renvoie QUE `result` (string), pas `result_int`.
 */
const RESULT_TO_CODE: Record<NeverBounceResult, number> = {
  valid: 0,
  invalid: 1,
  disposable: 2,
  catchall: 3,
  unknown: 4,
};

const VALID_RESULTS: NeverBounceResult[] = [
  'valid',
  'invalid',
  'disposable',
  'catchall',
  'unknown',
];

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
    console.log('[neverbounce] check email=%s result=unknown code=4 (network error)', email);
    return { result: 'unknown', code: 4 };
  }

  if (!response.ok) {
    console.log(
      '[neverbounce] check email=%s result=unknown code=4 (http %d)',
      email,
      response.status,
    );
    return { result: 'unknown', code: 4 };
  }

  const data = (await response.json().catch(() => ({}))) as {
    status?: string;
    result?: string;
    credits_info?: { paid_credits_remaining?: number };
  };

  // V4 API : la response contient `result` (string), PAS `result_int`.
  // Si status != success ou result manque, on fallback unknown.
  if (data.status !== 'success' || !data.result) {
    console.log(
      '[neverbounce] check email=%s result=unknown code=4 (status=%s)',
      email,
      data.status,
    );
    return { result: 'unknown', code: 4 };
  }

  const result: NeverBounceResult = (VALID_RESULTS as string[]).includes(data.result)
    ? (data.result as NeverBounceResult)
    : 'unknown';
  const code = RESULT_TO_CODE[result];

  console.log('[neverbounce] check email=%s result=%s code=%d', email, result, code);
  return { result, code };
}

/**
 * Politique P3 : seuls 'valid' et 'catchall' passent.
 */
export function isDeliverable(result: NeverBounceResult): boolean {
  return result === 'valid' || result === 'catchall';
}
