/**
 * Auto-retry exponentiel pour les helpers de sync (Sellsy, Stripe, Brevo).
 *
 * Strategy :
 *   - 3 retries max
 *   - Backoff : 1s, 4s, 16s (exponentiel x4)
 *   - Catch : erreurs reseau (TypeError, AbortError) + 5xx HTTP + 429 (rate limit)
 *   - Pas de retry sur : 4xx (sauf 429), erreurs metier (validation), SyncSkippedError
 *
 * Apres echec final (3 retries epuisees) :
 *   - Log structure [sync/retry] final-fail
 *   - Appel onFinalError(error) pour permettre au caller de :
 *       1. UPDATE prospects.last_sync_error_message + last_sync_error_at + provider
 *       2. Notifier admin via brevo (template admin_sync_error)
 *       3. Marquer la fiche prospect avec status=error
 *   - L'erreur N'EST PAS rethrowee (best-effort sync). Le caller decide quoi faire.
 *
 * Logs : prefix [sync/retry].
 */

import { SyncSkippedError } from './skip-if-test';

export interface RetryOptions {
  /** Label de l'operation pour les logs (ex: "sellsy/sync-prospect"). */
  label: string;
  /** Backoff en ms. Par defaut [1000, 4000, 16000]. */
  backoffMs?: number[];
  /** Callback appele apres echec final. */
  onFinalError?: (error: Error, attempts: number) => void | Promise<void>;
}

const DEFAULT_BACKOFF = [1000, 4000, 16000];

/**
 * Determine si une erreur est retryable :
 *   - Network errors (TypeError fetch failed, AbortError, ECONNRESET, etc.)
 *   - 5xx HTTP
 *   - 429 Too Many Requests
 *
 * NOT retryable :
 *   - 4xx (sauf 429) → erreur cote client, retry ne servira a rien
 *   - SyncSkippedError → mode test, on n'essaie meme pas
 *   - Erreurs metier custom (a etendre selon les helpers)
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof SyncSkippedError) return false;
  if (!(error instanceof Error)) return true;

  // Pour les erreurs avec un .status (SellsyError, BrevoError, ResendError)
  const status = (error as { status?: number }).status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  // Erreurs reseau natives : retryable.
  return true;
}

export async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF;
  const maxAttempts = backoff.length + 1; // 1 attempt initial + N retries

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(
          '[sync/retry] success label=%s attempt=%d/%d',
          options.label,
          attempt,
          maxAttempts,
        );
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // SyncSkippedError = mode test, on rethrow pour que le caller le voit (loggue OK).
      if (error instanceof SyncSkippedError) {
        throw error;
      }

      const retryable = isRetryable(error);
      const isLastAttempt = attempt === maxAttempts;

      console.warn(
        '[sync/retry] error label=%s attempt=%d/%d retryable=%s last_attempt=%s msg=%s',
        options.label,
        attempt,
        maxAttempts,
        retryable,
        isLastAttempt,
        lastError.message,
      );

      if (!retryable || isLastAttempt) {
        break;
      }

      // Sleep avant retry suivant.
      const delay = backoff[attempt - 1] ?? backoff[backoff.length - 1];
      await sleep(delay);
    }
  }

  // Echec final.
  const finalError = lastError ?? new Error('withExponentialRetry: unknown failure');
  console.error(
    '[sync/retry] final-fail label=%s attempts=%d msg=%s',
    options.label,
    maxAttempts,
    finalError.message,
  );

  if (options.onFinalError) {
    try {
      await options.onFinalError(finalError, maxAttempts);
    } catch (callbackErr) {
      console.error(
        '[sync/retry] onFinalError callback threw label=%s msg=%s',
        options.label,
        callbackErr instanceof Error ? callbackErr.message : String(callbackErr),
      );
    }
  }

  throw finalError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
