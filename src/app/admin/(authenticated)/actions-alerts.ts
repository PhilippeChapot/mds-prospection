'use server';

/**
 * Server actions admin alerts — P5.x.11.
 *
 * resolveAlertAction : marque une alerte resolved_at=now() + resolved_by.
 * Utilise par AlertsCard sur le dashboard admin.
 */

import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function resolveAlertAction(alertId: string): Promise<void> {
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('admin_alerts')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
    })
    .eq('id', alertId)
    .is('resolved_at', null); // idempotent : ne touche que les non resolues
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
