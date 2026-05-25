/**
 * P6.x.8-bis — wrapper helper pour logger les appels Stripe dans
 * `public.sync_logs`.
 *
 * Mirroir de `lib/sellsy/sync-logger.ts` mais pour Stripe (target='stripe'
 * ajouté à l'enum sync_target en migration 0056).
 *
 * Best-effort : un échec d'insert sync_logs ne doit jamais faire échouer
 * l'opération métier (création Payment Link, webhook handler, etc.).
 *
 * Enums DB (cf. migration 0002 + 0056) :
 *   - target: 'sellsy' | 'brevo' | 'connectonair' | 'stripe'
 *   - operation (sync_op): 'create' | 'update' | 'pull' | 'check'
 *   - status: 'success' | 'pending' | 'error'
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type StripeOperation = 'create' | 'update' | 'pull' | 'check';
export type StripeLogStatus = 'success' | 'error';

interface LogStripeCallParams {
  entityType: string;
  entityId: string;
  operation: StripeOperation;
  status: StripeLogStatus;
  errorMessage?: string | null;
  payload?: unknown;
}

export async function logStripeCall(params: LogStripeCallParams): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from('sync_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      target: 'stripe',
      operation: params.operation,
      status: params.status === 'success' ? 'success' : 'error',
      error_message: params.errorMessage ? params.errorMessage.slice(0, 2000) : null,
      payload: (params.payload ?? null) as never,
    });
  } catch (err) {
    console.warn(
      '[stripe/sync-logger] insert-failed entity=%s/%s op=%s status=%s msg=%s',
      params.entityType,
      params.entityId,
      params.operation,
      params.status,
      err instanceof Error ? err.message : String(err),
    );
  }
}
