'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import type { Database } from '@/lib/supabase/database.types';

type CategoryTarif = Database['public']['Enums']['category_tarif'];
type PoleCode = Database['public']['Enums']['pole_code'];

const PoleCodeSchema = z.enum([
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'INCONNU',
]) satisfies z.ZodType<PoleCode>;

const CategoryTarifSchema = z.enum([
  'prs_exhibitor',
  'standard',
  'non_eligible',
]) satisfies z.ZodType<CategoryTarif>;

const InputSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  primary_domain: z.string().trim().max(120).optional(),
  country: z.string().trim().length(2).optional(),
  category: CategoryTarifSchema,
  pole_code: PoleCodeSchema,
  was_prs_2026_exhibitor: z
    .union([z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type UpdateCompanyState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  duplicateCompanyId?: string;
};

export async function updateCompanyAction(
  _prev: UpdateCompanyState,
  formData: FormData,
): Promise<UpdateCompanyState> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    return { error: 'Seul un admin peut editer une societe.' };
  }
  const supabase = await createSupabaseServerClient();

  const raw: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === 'string') raw[k] = v;
  });

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'form';
      fieldErrors[path] = issue.message;
    }
    return { error: 'Verifiez les champs en erreur.', fieldErrors };
  }
  const data = parsed.data;

  // Si le domaine a change, verifier l'unicite (en excluant la societe courante).
  if (data.primary_domain) {
    const { data: existing } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('primary_domain', data.primary_domain)
      .neq('id', data.company_id)
      .maybeSingle();
    if (existing) {
      return {
        error: `Une autre societe utilise deja ce domaine : ${existing.name}.`,
        fieldErrors: { primary_domain: 'Domaine deja utilise.' },
        duplicateCompanyId: existing.id,
      };
    }
  }

  const { data: poleRow } = await supabase
    .from('poles')
    .select('id')
    .eq('code', data.pole_code)
    .maybeSingle();
  if (!poleRow) {
    return { error: 'Pole invalide.' };
  }

  const { error: updateErr } = await supabase
    .from('companies')
    .update({
      name: data.name,
      name_normalized: data.name.toLowerCase(),
      primary_domain: data.primary_domain || null,
      country: data.country?.toUpperCase() || null,
      category: data.category,
      pole_id: poleRow.id,
      was_prs_2026_exhibitor: data.was_prs_2026_exhibitor,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.company_id);

  if (updateErr) {
    return { error: updateErr.message };
  }

  revalidatePath(`/admin/companies/${data.company_id}`);
  revalidatePath('/admin/companies');
  redirect(`/admin/companies/${data.company_id}`);
}
