/**
 * P2.x.1 — queries lecture `app_settings`.
 *
 * Pure read-side (utilise service-role). Merge avec SETTINGS_REGISTRY pour
 * enrichir les rows DB avec `label`, `description`, `type`, `is_known`.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  SETTINGS_REGISTRY,
  getSettingDef,
  type AppSettingCategory,
  type SettingFieldType,
} from './registry';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  category: AppSettingCategory;
  updated_at: string;
  updated_by_user_id: string | null;
  // Enrichi via registry
  label: string;
  type: SettingFieldType;
  is_known: boolean;
}

export async function listSettings(filter?: {
  category?: AppSettingCategory;
}): Promise<SettingRow[]> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('app_settings')
    .select('key, value, description, category, updated_at, updated_by_user_id')
    .order('category', { ascending: true })
    .order('key', { ascending: true });
  if (filter?.category) query = query.eq('category', filter.category);

  const { data, error } = await query;
  if (error) {
    console.error('[admin/preferences/queries] listSettings failed: %s', error.message);
    return [];
  }

  return (data ?? []).map((r) => enrichRow(r as Omit<SettingRow, 'label' | 'type' | 'is_known'>));
}

export async function getSettingByKey(key: string): Promise<SettingRow | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, description, category, updated_at, updated_by_user_id')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) return null;
  return enrichRow(data as Omit<SettingRow, 'label' | 'type' | 'is_known'>);
}

function enrichRow(r: Omit<SettingRow, 'label' | 'type' | 'is_known'>): SettingRow {
  const def = getSettingDef(r.key);
  return {
    ...r,
    label: def?.label ?? r.key,
    type: def?.type ?? 'json',
    is_known: !!def,
  };
}

/**
 * Retourne les keys du registry qui ne sont pas (encore) en DB. Utile pour
 * l'UI : on peut proposer de seeder les valeurs manquantes via le drawer
 * en mode "known".
 */
export function getMissingRegistryKeys(existingRows: SettingRow[]): string[] {
  const existing = new Set(existingRows.map((r) => r.key));
  return SETTINGS_REGISTRY.filter((d) => !existing.has(d.key)).map((d) => d.key);
}
