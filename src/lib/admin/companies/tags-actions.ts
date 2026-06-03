'use server';

/**
 * P5.x.CompaniesAddressAndTags — server action edition manuelle des
 * external_event_tags d une company (UI /admin/companies/[id]/edit).
 *
 * Complement des imports automatiques (P5.x.ExternalEvents). Si Phil
 * apprend qu une societe a participe a un event non-importe, il peut
 * la tagger manuellement.
 *
 * Whitelist stricte des event_keys autorisees + range annees [2020..2030]
 * pour eviter qu un tag random pollue le JSONB.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const ALLOWED_EVENT_KEYS = ['prs', 'mediadays_classic', 'rde', 'satis', 'cbd'] as const;
type AllowedEventKey = (typeof ALLOWED_EVENT_KEYS)[number];

const schema = z.object({
  company_id: z.string().uuid(),
  tags: z.record(z.string(), z.array(z.number().int().min(2020).max(2030))),
});

export async function updateCompanyExternalEventTagsAction(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ tags: Record<string, number[]> }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Reserve aux admins.' };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }

  // Validation whitelist : ne garder que les keys autorisees + years non vides
  // + dedup + sort.
  const cleanTags: Record<string, number[]> = {};
  for (const [key, years] of Object.entries(parsed.data.tags)) {
    if (!ALLOWED_EVENT_KEYS.includes(key as AllowedEventKey)) {
      continue;
    }
    const dedup = Array.from(new Set(years)).sort((a, b) => a - b);
    if (dedup.length > 0) cleanTags[key] = dedup;
  }

  const supabase = getSupabaseServiceClient();
  const { data: before } = await supabase
    .from('companies')
    .select('id, external_event_tags')
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Societe introuvable.' };

  const { error: updErr } = await supabase
    .from('companies')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ external_event_tags: cleanTags, updated_at: new Date().toISOString() } as any)
    .eq('id', parsed.data.company_id);
  if (updErr) return { ok: false, error: `Update DB: ${updErr.message}` };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'companies',
    entity_id: parsed.data.company_id,
    action: 'update',
    before: { external_event_tags: before.external_event_tags } as never,
    after: {
      kind: 'company_external_event_tags_updated',
      actor_role: profile.role,
      external_event_tags: cleanTags,
    } as never,
  });

  revalidatePath(`/admin/companies/${parsed.data.company_id}/edit`);
  revalidatePath(`/admin/companies/${parsed.data.company_id}`);
  revalidatePath('/admin/companies');
  return { ok: true, data: { tags: cleanTags } };
}
