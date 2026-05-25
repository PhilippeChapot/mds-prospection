/**
 * P6.x.6 — wrapper helper pour logger les appels Sellsy dans
 * `public.sync_logs`.
 *
 * Objectif : avoir une trace persistante des opérations Sellsy critiques
 * (POST /individuals, /companies, /estimates) avec leur statut + payload
 * sérialisé. Permet de remonter rapidement les patterns d'échec sans avoir
 * à scroller Vercel logs.
 *
 * Best-effort : un échec d'insertion sync_logs n'a JAMAIS le droit de faire
 * échouer l'opération métier (ex: une émission devis qui marche). Donc on
 * try/catch tout silencieusement.
 *
 * Enums DB (cf. migration 0002) :
 *   - target: 'sellsy' | 'brevo' | 'connectonair'
 *   - operation (sync_op): 'create' | 'update' | 'pull' | 'check'
 *   - status: 'success' | 'pending' | 'error'
 *
 * Note : entity_id est `uuid not null` → toujours passer un UUID MDS
 * (prospect.id, contact.id, company.id), pas l'id Sellsy externe.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type SellsyOperation = 'create' | 'update' | 'pull' | 'check';
export type SellsyLogStatus = 'success' | 'error';

interface LogSellsyCallParams {
  /** entity_type côté MDS : 'prospects' | 'contacts' | 'companies'... */
  entityType: string;
  /** entity_id UUID (PK côté MDS). */
  entityId: string;
  /** Opération Sellsy effectuée (create/update/pull/check). */
  operation: SellsyOperation;
  /** Statut final. */
  status: SellsyLogStatus;
  /** Message d'erreur si status='error'. */
  errorMessage?: string | null;
  /** Payload optionnel (request body, response body, ou diff). */
  payload?: unknown;
}

export async function logSellsyCall(params: LogSellsyCallParams): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const dbStatus = params.status === 'success' ? 'success' : 'error';
    await supabase.from('sync_logs').insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      target: 'sellsy',
      operation: params.operation,
      status: dbStatus,
      error_message: params.errorMessage ? params.errorMessage.slice(0, 2000) : null,
      payload: (params.payload ?? null) as never,
    });
  } catch (err) {
    // Best-effort : on n'échoue jamais le flow principal sur un sync_logs KO.
    console.warn(
      '[sellsy/sync-logger] insert-failed entity=%s/%s op=%s status=%s msg=%s',
      params.entityType,
      params.entityId,
      params.operation,
      params.status,
      err instanceof Error ? err.message : String(err),
    );
  }
}
