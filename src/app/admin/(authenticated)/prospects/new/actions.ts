'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveSeasonId, requireAdminProfile } from '@/lib/supabase/auth-helpers';
import type { Database } from '@/lib/supabase/database.types';

type CategoryTarif = Database['public']['Enums']['category_tarif'];
type PackCode = Database['public']['Enums']['pack_code'];
type ProspectStatus = Database['public']['Enums']['prospect_status'];
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

const PackCodeSchema = z.enum([
  'ACCESS',
  'CLASSIC',
  'PREMIUM',
  'A_DEFINIR',
]) satisfies z.ZodType<PackCode>;

const CategoryTarifSchema = z.enum([
  'prs_exhibitor',
  'standard',
  'non_eligible',
]) satisfies z.ZodType<CategoryTarif>;

const StatusSchema = z.enum([
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'paye_integral',
  'signe',
  'perdu',
]) satisfies z.ZodType<ProspectStatus>;

const InputSchema = z
  .object({
    company_mode: z.enum(['existing', 'new']),
    company_id: z.string().uuid().optional().or(z.literal('')),
    company_name: z.string().trim().min(2).max(200).optional(),
    company_primary_domain: z.string().trim().max(120).optional(),
    company_country: z.string().trim().length(2).optional(),
    company_category: CategoryTarifSchema.optional(),
    company_pole_code: PoleCodeSchema.optional(),

    // P5.x.24 : si fourni, on utilise ce contact existant (mode='existing').
    // Sinon, on insère/upsert via contact_email (mode='new').
    contact_id: z.string().uuid().optional().or(z.literal('')),
    contact_mode: z.enum(['existing', 'new']).optional().default('new'),

    contact_first_name: z.string().trim().max(80).optional(),
    contact_last_name: z.string().trim().max(80).optional(),
    contact_email: z.string().trim().toLowerCase().email(),
    contact_phone: z.string().trim().max(30).optional(),
    contact_role: z.string().trim().max(80).optional(),

    pack_code: PackCodeSchema.default('A_DEFINIR'),
    status: StatusSchema.default('lead'),
    estimated_amount: z.string().optional(),
    owner_id: z.string().uuid(),
    notes: z.string().trim().max(4000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.company_mode === 'existing' && !data.company_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choisissez une societe existante ou creez-en une.',
        path: ['company_id'],
      });
    }
    if (data.company_mode === 'new') {
      if (!data.company_name) {
        ctx.addIssue({ code: 'custom', message: 'Nom requis', path: ['company_name'] });
      }
      if (!data.company_category) {
        ctx.addIssue({
          code: 'custom',
          message: 'Categorie requise',
          path: ['company_category'],
        });
      }
      if (!data.company_pole_code) {
        ctx.addIssue({
          code: 'custom',
          message: 'Pole requis',
          path: ['company_pole_code'],
        });
      }
    }
  });

export type CreateProspectState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parseAmountEur(input?: string): number | null {
  if (!input) return null;
  const cleaned = input
    .replace(/[^0-9.,-]/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

export async function createProspectAction(
  _prev: CreateProspectState,
  formData: FormData,
): Promise<CreateProspectState> {
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const raw: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === 'string') raw[k] = v;
  });

  // Sales force owner_id = self (RLS l'exigerait de toute facon).
  if (profile.role === 'sales') {
    raw.owner_id = profile.id;
  }

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

  let companyId = data.company_id || '';

  // 1. Resoudre/creer la societe
  if (data.company_mode === 'new') {
    const { data: poleRow } = await supabase
      .from('poles')
      .select('id')
      .eq('code', data.company_pole_code!)
      .maybeSingle();
    if (!poleRow) {
      return { error: 'Pole invalide.' };
    }
    const nameNormalized = data.company_name!.toLowerCase();
    const { data: created, error: companyErr } = await supabase
      .from('companies')
      .insert({
        name: data.company_name!,
        name_normalized: nameNormalized,
        primary_domain: data.company_primary_domain || null,
        country: data.company_country?.toUpperCase() || null,
        category: data.company_category!,
        pole_id: poleRow.id,
        pole_classified_by: 'manual',
        pole_classified_at: new Date().toISOString(),
        pole_confidence: 1,
      })
      .select('id')
      .single();
    if (companyErr || !created) {
      return { error: companyErr?.message ?? 'Erreur creation societe.' };
    }
    companyId = created.id;
  }

  // 2. Resoudre/creer le contact
  //    P5.x.24 : si data.contact_id fourni (mode existing), on l'utilise tel
  //    quel (avec check de rattachement à la company sélectionnée).
  let contactId: string;
  if (data.contact_id) {
    const { data: pickedContact, error: pickedErr } = await supabase
      .from('contacts')
      .select('id, company_id')
      .eq('id', data.contact_id)
      .maybeSingle();
    if (pickedErr || !pickedContact) {
      return { error: 'Contact selectionne introuvable.' };
    }
    if (pickedContact.company_id !== companyId) {
      return {
        error: 'Le contact selectionne appartient a une autre societe. Ajustez la societe.',
        fieldErrors: { contact_id: 'Contact rattache a une autre societe.' },
      };
    }
    contactId = pickedContact.id;
  } else {
    // Mode 'new' : insert ou rattachement par email
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, company_id')
      .ilike('email', data.contact_email)
      .maybeSingle();
    if (existingContact) {
      if (existingContact.company_id !== companyId) {
        return {
          error:
            'Cet email est deja rattache a une autre societe. Verifiez ou creez un autre contact.',
          fieldErrors: { contact_email: 'Email deja utilise sur une autre societe.' },
        };
      }
      contactId = existingContact.id;
    } else {
      const { data: createdContact, error: contactErr } = await supabase
        .from('contacts')
        .insert({
          company_id: companyId,
          first_name: data.contact_first_name || null,
          last_name: data.contact_last_name || null,
          email: data.contact_email,
          phone: data.contact_phone || null,
          role: data.contact_role || null,
          is_primary: true,
        })
        .select('id')
        .single();
      if (contactErr || !createdContact) {
        return { error: contactErr?.message ?? 'Erreur creation contact.' };
      }
      contactId = createdContact.id;
    }
  }

  // 3. Creer le prospect
  const seasonId = await getActiveSeasonId();
  const { data: prospect, error: prospectErr } = await supabase
    .from('prospects')
    .insert({
      season_id: seasonId,
      company_id: companyId,
      primary_contact_id: contactId,
      owner_id: data.owner_id,
      status: data.status,
      pack_code: data.pack_code,
      estimated_amount: parseAmountEur(data.estimated_amount),
      notes: data.notes || null,
      source: 'direct',
    })
    .select('id')
    .single();

  if (prospectErr || !prospect) {
    return { error: prospectErr?.message ?? 'Erreur creation prospect.' };
  }

  revalidatePath('/admin/prospects');
  redirect(`/admin/prospects/${prospect.id}`);
}
