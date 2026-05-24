'use server';

/**
 * P5.x.23 — server action : resoudre une alerte SIREN ambigu.
 *
 * Admin uniquement (sales rejeté). UPDATE company.siren + ferme l'alerte.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/siren-actions]';

const schema = z.object({
  company_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  alert_id: z.string().uuid(),
  siren: z.string().regex(/^\d{9}$/, 'SIREN = 9 chiffres'),
  siret: z.string().regex(/^\d{14}$/, 'SIRET = 14 chiffres'),
});

type Result = { ok: true } | { ok: false; error: string };

export async function resolveSirenAmbiguousAction(input: unknown): Promise<Result> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Admin uniquement.' };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation' };
  }
  const { company_id, prospect_id, alert_id, siren, siret } = parsed.data;
  const supabase = getSupabaseServiceClient();

  const { error: updateErr } = await supabase
    .from('companies')
    .update({
      siren,
      siret,
      siren_verified_at: new Date().toISOString(),
      siren_source: 'insee_manual_select',
    })
    .eq('id', company_id);
  if (updateErr) return { ok: false, error: updateErr.message };

  const { error: resolveErr } = await supabase
    .from('admin_alerts')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
    })
    .eq('id', alert_id);
  if (resolveErr) {
    console.warn('%s alert-resolve-failed id=%s msg=%s', LOG_PREFIX, alert_id, resolveErr.message);
    // On ne fail pas — l'update company a réussi. Le cron admin-alerts pourra
    // nettoyer l'alerte au prochain run.
  }

  console.log(
    '%s resolved company=%s prospect=%s siren=%s',
    LOG_PREFIX,
    company_id,
    prospect_id,
    siren,
  );

  revalidatePath(`/admin/prospects/${prospect_id}`);
  revalidatePath(`/admin/companies/${company_id}`);
  return { ok: true };
}
