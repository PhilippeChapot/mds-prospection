/**
 * P9.1 — wrapper helper pour logger les webhooks Tawk.to dans
 * `public.sync_logs` (target='tawk', cf. migration 0062).
 *
 * Mirror exact de `lib/sellsy/sync-logger.ts` : best-effort, jamais
 * fail le flow metier. Sert au debug des leads chat (qui a envoye
 * quoi, est-ce qu'on a accepte la signature, etc.).
 *
 * Enums DB :
 *   - target: 'tawk' (P9.1)
 *   - operation: 'create' | 'update' | 'pull' | 'check'
 *   - status: 'success' | 'error' | 'pending'
 *
 * `entity_id` est `uuid not null` cote DB. Pour les events Tawk qui
 * n'ont pas (encore) de prospect MDS attache (ex: signature invalide,
 * payload sans email), on utilise un UUID sentinelle "all-zeros".
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type TawkOperation = 'create' | 'update' | 'pull' | 'check';
export type TawkLogStatus = 'success' | 'error' | 'pending';

/** UUID sentinelle pour les events Tawk sans prospect MDS encore attache. */
export const TAWK_NO_PROSPECT_UUID = '00000000-0000-0000-0000-000000000000';

interface LogTawkCallParams {
  /** entity_type cote MDS : 'prospects' | 'chat_lead' (sentinelle). */
  entityType: string;
  /** entity_id UUID (PK cote MDS) ou TAWK_NO_PROSPECT_UUID. */
  entityId: string;
  operation: TawkOperation;
  status: TawkLogStatus;
  errorMessage?: string | null;
  /** Payload optionnel (webhook body, ou metadata visitor). */
  payload?: unknown;
}

export async function logTawkCall(params: LogTawkCallParams): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from('sync_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      target: 'tawk',
      operation: params.operation,
      status: params.status,
      error_message: params.errorMessage ? params.errorMessage.slice(0, 2000) : null,
      payload: (params.payload ?? null) as never,
    });
  } catch (err) {
    console.warn(
      '[tawk/sync-logger] insert-failed entity=%s/%s op=%s status=%s msg=%s',
      params.entityType,
      params.entityId,
      params.operation,
      params.status,
      err instanceof Error ? err.message : String(err),
    );
  }
}
