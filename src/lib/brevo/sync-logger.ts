/**
 * P4.x.1 — wrapper helper pour logger les appels Brevo dans
 * `public.sync_logs`.
 *
 * Mirror de `lib/sellsy/sync-logger.ts` et `lib/stripe/sync-logger.ts`.
 *
 * Best-effort : un échec d'insert sync_logs ne doit jamais faire échouer
 * l'opération métier (upsert contact, sendTransactionalEmail).
 *
 * Enums DB (cf. migration 0002 + 0056) :
 *   - target: 'sellsy' | 'brevo' | 'connectonair' | 'stripe'
 *   - operation (sync_op): 'create' | 'update' | 'pull' | 'check'
 *   - status: 'success' | 'pending' | 'error'
 *
 * Note : entity_id est `uuid not null` -> toujours passer un UUID MDS
 * (prospect.id, contact.id, company.id), pas l'id Brevo externe.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type BrevoOperation = 'create' | 'update' | 'pull' | 'check';
export type BrevoLogStatus = 'success' | 'error';

interface LogBrevoCallParams {
  entityType: string;
  entityId: string;
  operation: BrevoOperation;
  status: BrevoLogStatus;
  errorMessage?: string | null;
  payload?: unknown;
}

export async function logBrevoCall(params: LogBrevoCallParams): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from('sync_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      target: 'brevo',
      operation: params.operation,
      status: params.status === 'success' ? 'success' : 'error',
      error_message: params.errorMessage ? params.errorMessage.slice(0, 2000) : null,
      payload: (params.payload ?? null) as never,
    });
  } catch (err) {
    console.warn(
      '[brevo/sync-logger] insert-failed entity=%s/%s op=%s status=%s msg=%s',
      params.entityType,
      params.entityId,
      params.operation,
      params.status,
      err instanceof Error ? err.message : String(err),
    );
  }
}
