'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { cleanDomainList, normalizeDomain } from '@/lib/utils/domain';
import type { Database } from '@/lib/supabase/database.types';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

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
  /** Stringifié côté UI (DomainTagsInput émet JSON.stringify(value)). */
  alternate_domains: z.string().optional().default('[]'),
  country: z.string().trim().length(2).optional(),
  category: CategoryTarifSchema,
  pole_code: PoleCodeSchema,
  was_prs_2026_exhibitor: z
    .union([z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  // P5.x.CompanyEditAddressSave — coordonnées postales éditables manuellement.
  // Optionnels : si la clé est absente du FormData (champ non rendu), on ne
  // touche PAS la colonne (évite d'écraser une valeur posée par l'enrichissement,
  // ex: `state` qui n'a pas de champ dans le form). Une chaîne vide "" reste
  // distincte de `undefined` → elle EFFACE la colonne (mise à NULL).
  raw_address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(20).optional(),
  state: z.string().trim().max(120).optional(),
  website: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(40).optional(),
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
  if (!hasAdminAccess(profile.role)) {
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

  // Parse + nettoie alternate_domains (JSON stringifié côté form)
  let altDomains: string[] = [];
  try {
    const arr = JSON.parse(data.alternate_domains);
    if (Array.isArray(arr)) altDomains = cleanDomainList(arr);
  } catch {
    // payload corrompu → on garde []
  }
  // Filtre defense-in-depth : exclut tout doublon avec le primary_domain
  const normalizedPrimary = data.primary_domain ? normalizeDomain(data.primary_domain) : null;
  if (normalizedPrimary) {
    altDomains = altDomains.filter((d) => d !== normalizedPrimary);
  }

  // Snapshot avant pour le diff audit (champs trackés human-readable).
  const { data: before } = await supabase
    .from('companies')
    .select(
      'name, primary_domain, country, category, raw_address, city, postal_code, state, website, phone',
    )
    .eq('id', data.company_id)
    .maybeSingle();

  // Patch de base (champs toujours présents dans le form).
  const patch: Record<string, unknown> = {
    name: data.name,
    name_normalized: data.name.toLowerCase(),
    primary_domain: normalizedPrimary,
    alternate_domains: altDomains,
    country: data.country?.toUpperCase() || null,
    category: data.category,
    pole_id: poleRow.id,
    was_prs_2026_exhibitor: data.was_prs_2026_exhibitor,
    updated_at: new Date().toISOString(),
  };

  // Coordonnées postales : on n'inclut une colonne QUE si la clé a été
  // soumise (undefined = champ absent → ne pas toucher). Chaîne vide → NULL
  // (l'admin efface volontairement). Cf. note Supabase null vs undefined.
  const addressFields = [
    'raw_address',
    'city',
    'postal_code',
    'state',
    'website',
    'phone',
  ] as const;
  for (const f of addressFields) {
    const v = data[f];
    if (v !== undefined) patch[f] = v === '' ? null : v;
  }

  const { error: updateErr } = await supabase
    .from('companies')
    .update(patch as never)
    .eq('id', data.company_id);

  if (updateErr) {
    return { error: updateErr.message };
  }

  // Audit log : diff before/after sur les champs trackés effectivement modifiés.
  const tracked = ['name', 'primary_domain', 'country', 'category', ...addressFields] as const;
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  for (const k of tracked) {
    if (!(k in patch)) continue; // champ non concerné par cet update
    const newVal = patch[k] ?? null;
    const oldVal = (before as Record<string, unknown> | null)?.[k] ?? null;
    if (oldVal !== newVal) {
      beforeDiff[k] = oldVal;
      afterDiff[k] = newVal;
    }
  }
  if (Object.keys(afterDiff).length > 0) {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'companies',
      entity_id: data.company_id,
      action: 'update',
      before: beforeDiff as never,
      after: { kind: 'company_updated', ...afterDiff } as never,
    });
  }

  revalidatePath(`/admin/companies/${data.company_id}`);
  revalidatePath('/admin/companies');
  redirect(`/admin/companies/${data.company_id}`);
}
