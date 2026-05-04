/**
 * Helper centralise pour le mode test/sandbox.
 *
 * Tous les helpers de sync (Sellsy, Stripe, Brevo, VIES) doivent appeler
 * `assertSyncAllowed(prospect)` en debut d'execution. Si le prospect est
 * marque `is_test=true`, on throw `SyncSkippedError` qui est catch
 * silencieusement par les wrappers superieurs.
 *
 * Logs structures pour grep Vercel Logs : [sync/skip-if-test].
 */

export class SyncSkippedError extends Error {
  prospectId: string;
  reason: 'is_test' | 'no_consent' | 'manual';

  constructor(prospectId: string, reason: 'is_test' | 'no_consent' | 'manual' = 'is_test') {
    super(`Sync skipped (prospect ${prospectId}, reason=${reason})`);
    this.name = 'SyncSkippedError';
    this.prospectId = prospectId;
    this.reason = reason;
  }
}

export function assertSyncAllowed(
  prospect: { id: string; is_test: boolean },
  providerLabel: string,
) {
  if (prospect.is_test) {
    console.log(
      '[sync/skip-if-test] skip provider=%s prospect_id=%s reason=is_test',
      providerLabel,
      prospect.id,
    );
    throw new SyncSkippedError(prospect.id, 'is_test');
  }
}
