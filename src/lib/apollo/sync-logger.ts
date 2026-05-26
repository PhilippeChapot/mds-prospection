/**
 * P5.x.Apollo — wrapper helper pour logger les appels Apollo dans
 * `public.sync_logs` (target='apollo' depuis migration 0060).
 *
 * Mirror de lib/sellsy/sync-logger.ts, lib/stripe/sync-logger.ts,
 * lib/brevo/sync-logger.ts.
 *
 * Best-effort : un échec d'insert ne fait jamais échouer le flow Apollo.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type ApolloOperation = 'create' | 'update' | 'pull' | 'check';
export type ApolloLogStatus = 'success' | 'error';

interface LogApolloCallParams {
  entityType: string;
  entityId: string;
  operation: ApolloOperation;
  status: ApolloLogStatus;
  errorMessage?: string | null;
  payload?: unknown;
}

export async function logApolloCall(params: LogApolloCallParams): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from('sync_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      target: 'apollo',
      operation: params.operation,
      status: params.status === 'success' ? 'success' : 'error',
      error_message: params.errorMessage ? params.errorMessage.slice(0, 2000) : null,
      payload: (params.payload ?? null) as never,
    });
  } catch (err) {
    console.warn(
      '[apollo/sync-logger] insert-failed entity=%s/%s op=%s status=%s msg=%s',
      params.entityType,
      params.entityId,
      params.operation,
      params.status,
      err instanceof Error ? err.message : String(err),
    );
  }
}
