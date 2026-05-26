/**
 * P5.x.1 — queries lecture public.users (admin).
 *
 * Pure read-side via service-role. Pas d'écriture ici.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type UserRole = 'admin' | 'sales' | 'super_admin';

export const USER_ROLES: readonly UserRole[] = ['admin', 'sales', 'super_admin'] as const;

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  totp_enabled: boolean;
  last_login_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ListUsersFilters {
  include_archived?: boolean;
  role?: UserRole;
  search?: string;
  page: number;
  page_size: number;
}

export interface ListUsersResult {
  rows: UserRow[];
  total: number;
  page: number;
  page_size: number;
  /** Nombre de super_admin actifs (utile UI : confirmer si on est le dernier). */
  active_super_admin_count: number;
}

export async function listUsers(filters: ListUsersFilters): Promise<ListUsersResult> {
  const supabase = getSupabaseServiceClient();
  const offset = (filters.page - 1) * filters.page_size;

  let query = supabase
    .from('users')
    .select('id, email, full_name, role, totp_enabled, last_login_at, archived_at, created_at', {
      count: 'exact',
    })
    .order('last_login_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.page_size - 1);

  if (!filters.include_archived) query = query.is('archived_at', null);
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.search) {
    const s = filters.search.trim();
    if (s) {
      // PostgREST `or` filter syntax: `or=(col.op.val,col2.op.val)`.
      query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
    }
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[admin/users/queries] listUsers failed: %s', error.message);
    return {
      rows: [],
      total: 0,
      page: filters.page,
      page_size: filters.page_size,
      active_super_admin_count: 0,
    };
  }

  // Compte des super_admin actifs (lecture séparée, peu coûteuse).
  const { count: superCount } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .is('archived_at', null);

  return {
    rows: (data ?? []) as UserRow[],
    total: count ?? 0,
    page: filters.page,
    page_size: filters.page_size,
    active_super_admin_count: superCount ?? 0,
  };
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, totp_enabled, last_login_at, archived_at, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserRow;
}

export async function countActiveSuperAdmins(excludeId?: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .is('archived_at', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { count } = await query;
  return count ?? 0;
}
