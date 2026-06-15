'use server';

/**
 * P15.1.VisitorModel — création manuelle d'un visiteur.
 *
 * Deux modes (mutuellement exclusifs) :
 *   - contact_id : on rattache un contact existant.
 *   - new_contact : on crée/réutilise un contact (par email), avec création
 *     éventuelle de la société.
 *
 * Accès DB via service-role (RLS visitors = service_role only) + garde
 * requireAdminProfile().
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { POLE_CODES } from '@/lib/design-tokens';
import {
  VISITOR_TYPES,
  VISITOR_STATUSES,
  VISITOR_SOURCES,
  VISITOR_LANGUAGES,
} from '@/lib/visitors/constants';

const NewContactSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone_mobile: z.string().trim().max(50).optional(),
  role: z.string().trim().max(250).optional(),
  company_id: z.string().uuid().optional(),
  new_company_name: z.string().trim().min(2).max(200).optional(),
});

const CreateVisitorSchema = z
  .object({
    contact_id: z.string().uuid().optional(),
    new_contact: NewContactSchema.optional(),

    pole: z.enum(POLE_CODES).optional().nullable(),
    visitor_type: z.enum(VISITOR_TYPES).optional().nullable(),
    is_vip: z.boolean().default(false),
    source: z.enum(VISITOR_SOURCES).default('manual_admin'),
    status: z.enum(VISITOR_STATUSES).default('lead'),
    language: z.enum(VISITOR_LANGUAGES).default('fr'),
    owner_user_id: z.string().uuid().optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((d) => Boolean(d.contact_id) || Boolean(d.new_contact), {
    message: 'contact_id OU new_contact requis',
    path: ['contact_id'],
  });

export type CreateVisitorInput = z.input<typeof CreateVisitorSchema>;

export async function createVisitorAction(
  input: CreateVisitorInput,
): Promise<{ success: true; visitor_id: string }> {
  const profile = await requireAdminProfile();
  const parsed = CreateVisitorSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  let contactId = parsed.contact_id ?? null;
  let companyId: string | null = null;

  // ── Mode new_contact : créer/réutiliser contact (+ société) ──────────────
  if (!contactId && parsed.new_contact) {
    const nc = parsed.new_contact;

    const { data: existing } = await supabase
      .from('contacts')
      .select('id, company_id')
      .ilike('email', nc.email)
      .maybeSingle();

    if (existing) {
      contactId = existing.id;
      companyId = existing.company_id ?? null;
    } else {
      // Résoudre/créer la société.
      if (nc.company_id) {
        companyId = nc.company_id;
      } else if (nc.new_company_name) {
        const nameNormalized = nc.new_company_name.toLowerCase();
        // Réutilise une société existante au même nom normalisé si possible.
        const { data: existingCo } = await supabase
          .from('companies')
          .select('id')
          .eq('name_normalized', nameNormalized)
          .maybeSingle();
        if (existingCo) {
          companyId = existingCo.id;
        } else {
          const { data: newCo, error: coErr } = await supabase
            .from('companies')
            .insert({
              name: nc.new_company_name,
              name_normalized: nameNormalized,
              category: 'standard',
            })
            .select('id')
            .single();
          if (coErr || !newCo) throw new Error(coErr?.message ?? 'Erreur création société.');
          companyId = newCo.id;
        }
      }

      // contacts.company_id est NOT NULL → une société est obligatoire.
      if (!companyId) {
        throw new Error('Une société (existante ou nouvelle) est requise pour créer un visiteur.');
      }

      const { data: newContact, error: contactErr } = await supabase
        .from('contacts')
        .insert({
          first_name: nc.first_name,
          last_name: nc.last_name,
          email: nc.email,
          phone_mobile: nc.phone_mobile || null,
          role: nc.role || null,
          company_id: companyId,
        })
        .select('id')
        .single();
      if (contactErr || !newContact)
        throw new Error(contactErr?.message ?? 'Erreur création contact.');
      contactId = newContact.id;
    }
  }

  if (!contactId) throw new Error('Contact introuvable après résolution.');

  // ── Garde-fou : un seul visiteur par contact (FK UNIQUE) ─────────────────
  const { data: existingVisitor } = await supabase
    .from('visitors')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (existingVisitor) {
    throw new Error('Ce contact est déjà enregistré comme visiteur.');
  }

  // Récupérer la société du contact si pas encore connue.
  if (!companyId) {
    const { data: c } = await supabase
      .from('contacts')
      .select('company_id')
      .eq('id', contactId)
      .maybeSingle();
    companyId = c?.company_id ?? null;
  }

  // ── Insert visiteur ──────────────────────────────────────────────────────
  const { data: newVisitor, error } = await supabase
    .from('visitors')
    .insert({
      contact_id: contactId,
      company_id: companyId,
      pole: parsed.pole ?? null,
      visitor_type: parsed.visitor_type ?? null,
      is_vip: parsed.is_vip,
      source: parsed.source,
      status: parsed.status,
      language: parsed.language,
      owner_user_id: parsed.owner_user_id ?? profile.id,
      notes: parsed.notes || null,
    })
    .select('id')
    .single();

  if (error || !newVisitor) throw new Error(error?.message ?? 'Erreur création visiteur.');

  // ── Audit log (timeline) ─────────────────────────────────────────────────
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'visitors',
    entity_id: newVisitor.id,
    action: 'create',
    after: {
      kind: 'visitor_created',
      contact_id: contactId,
      company_id: companyId,
      pole: parsed.pole ?? null,
      source: parsed.source,
    },
  });

  revalidatePath('/admin/visitors');
  return { success: true, visitor_id: newVisitor.id };
}
