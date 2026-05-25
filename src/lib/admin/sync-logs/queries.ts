/**
 * P4.x.1 — queries lecture sync_logs (admin only).
 *
 * Lit la table `public.sync_logs` peuplée par les helpers writers :
 *   - lib/sellsy/sync-logger.ts  -> target='sellsy'
 *   - lib/stripe/sync-logger.ts  -> target='stripe'
 *   - lib/brevo/sync-logger.ts   -> target='brevo'
 *
 * Auth : admin/sales/super_admin (hasAdminAccess). Pas d'écriture ici, juste
 * la lecture filtrable pour la page /admin/sync-logs.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SyncTarget = 'sellsy' | 'brevo' | 'connectonair' | 'stripe';
export type SyncOp = 'create' | 'update' | 'pull' | 'check';
export type SyncStatus = 'success' | 'pending' | 'error';

export const SYNC_TARGETS: readonly SyncTarget[] = [
  'sellsy',
  'brevo',
  'connectonair',
  'stripe',
] as const;
export const SYNC_OPS: readonly SyncOp[] = ['create', 'update', 'pull', 'check'] as const;
export const SYNC_STATUSES: readonly SyncStatus[] = ['success', 'pending', 'error'] as const;

export interface SyncLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  target: SyncTarget;
  operation: SyncOp;
  status: SyncStatus;
  error_message: string | null;
  payload: unknown;
  created_at: string;
}

export interface ListSyncLogsFilters {
  target?: SyncTarget;
  operation?: SyncOp;
  status?: SyncStatus;
  from?: string; // ISO date or datetime
  to?: string;
  entity_id?: string;
  page: number;
  page_size: number;
}

export interface ListSyncLogsResult {
  rows: SyncLogRow[];
  total: number;
  page: number;
  page_size: number;
}

export async function listSyncLogs(filters: ListSyncLogsFilters): Promise<ListSyncLogsResult> {
  const supabase = await createSupabaseServerClient();
  const offset = (filters.page - 1) * filters.page_size;

  let query = supabase
    .from('sync_logs')
    .select(
      'id, entity_type, entity_id, target, operation, status, error_message, payload, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.page_size - 1);

  if (filters.target) query = query.eq('target', filters.target);
  if (filters.operation) query = query.eq('operation', filters.operation);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.entity_id) query = query.eq('entity_id', filters.entity_id);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) {
    // Si date plain (YYYY-MM-DD), inclure toute la journée de fin.
    const toEnd = filters.to.includes('T')
      ? new Date(filters.to)
      : new Date(`${filters.to}T23:59:59.999Z`);
    if (!Number.isNaN(toEnd.getTime())) {
      query = query.lte('created_at', toEnd.toISOString());
    }
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[admin/sync-logs/queries] listSyncLogs failed: %s', error.message);
    return { rows: [], total: 0, page: filters.page, page_size: filters.page_size };
  }

  return {
    rows: (data ?? []) as SyncLogRow[],
    total: count ?? 0,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export interface SyncLogsKpis {
  total_7d: number;
  errors_7d: number;
  error_rate_7d: number; // 0-100
  top_target_in_error: SyncTarget | null;
}

export async function getSyncLogsKpis(): Promise<SyncLogsKpis> {
  const supabase = await createSupabaseServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('sync_logs')
    .select('target, status')
    .gte('created_at', sevenDaysAgo);

  if (error || !data) {
    console.error('[admin/sync-logs/queries] kpis failed: %s', error?.message);
    return { total_7d: 0, errors_7d: 0, error_rate_7d: 0, top_target_in_error: null };
  }

  const errorsByTarget = new Map<SyncTarget, number>();
  let total = 0;
  let errors = 0;
  for (const row of data) {
    total += 1;
    if (row.status === 'error') {
      errors += 1;
      const t = row.target as SyncTarget;
      errorsByTarget.set(t, (errorsByTarget.get(t) ?? 0) + 1);
    }
  }

  let topTarget: SyncTarget | null = null;
  let topCount = 0;
  for (const [t, c] of errorsByTarget) {
    if (c > topCount) {
      topTarget = t;
      topCount = c;
    }
  }

  return {
    total_7d: total,
    errors_7d: errors,
    error_rate_7d: total === 0 ? 0 : Math.round((errors / total) * 1000) / 10, // 1 décimale
    top_target_in_error: topTarget,
  };
}

export async function getSyncLogDetail(id: string): Promise<SyncLogRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('sync_logs')
    .select(
      'id, entity_type, entity_id, target, operation, status, error_message, payload, created_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as SyncLogRow;
}
