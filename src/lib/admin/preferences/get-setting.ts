/**
 * P2.x.1 — helper de lecture côté code pour `app_settings`.
 *
 * Lecture via service-role (RLS `app_settings_admin` réserve les writes
 * aux admins, mais les helpers app peuvent lire via service client).
 *
 * Note V1 : pas de cache mémoire. Les consommateurs en lisent rarement
 * (≤ 1×/request) et un cache cross-request demanderait un mécanisme
 * d'invalidation à la sauvegarde via revalidatePath. À reconsidérer si
 * un setting devient hot path.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function getSetting<T = unknown>(
  key: string,
  defaultValue?: T,
): Promise<T | undefined> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (data?.value === undefined || data?.value === null) return defaultValue;
    return data.value as T;
  } catch (err) {
    console.warn('[preferences/get-setting] key=%s failed msg=%s', key, String(err));
    return defaultValue;
  }
}
