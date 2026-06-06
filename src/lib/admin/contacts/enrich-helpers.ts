/**
 * P5.x.ConnectOnAirContactsCache (V2) — helper sync partage entre les
 * server actions d enrichissement contact.
 *
 * Pourquoi un fichier separe : doctrine [[feedback_pnpm_build_before_push_server_files]]
 * — un fichier 'use server' n exporte QUE des async functions. Les types
 * + le helper sync vivent ici.
 *
 * Regles upsert if empty (doctrine [[feedback_external_events_import_doctrine]] +
 * brief V2) :
 *   - JAMAIS ecraser un champ deja non-vide.
 *   - Apres update, set last_enrichment_source + last_enriched_at +
 *     updated_at.
 *   - Retourne fieldsUpdated[] pour audit log + UI feedback.
 *
 * Mirror du pattern companies/enrich-helpers.ts (V1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type ContactEnrichmentSource = 'connectonair' | 'apollo' | 'manual';

export type ContactEnrichmentFields = {
  phone?: string | null;
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  language?: 'FR' | 'EN' | null;
  linkedin_url?: string | null;
};

export type ContactEnrichmentResult = {
  fieldsUpdated: string[];
};

/**
 * Applique un enrichissement sur public.contacts :
 *   1. Lit la row courante.
 *   2. Calcule le diff (champs vides cote DB + valeur non-vide cote enrich).
 *   3. UPDATE atomique avec last_enrichment_source + last_enriched_at.
 *
 * Note : pas de 'use server' ici -> appelable depuis un fichier 'use server'.
 * Throw si le contact n existe pas ou si l UPDATE echoue.
 */
export async function applyEnrichmentToContact(
  contactId: string,
  source: ContactEnrichmentSource,
  fields: ContactEnrichmentFields,
  client?: SupabaseClient,
): Promise<ContactEnrichmentResult> {
  const supabase = client ?? getSupabaseServiceClient();

  // P5.x.ContactsCache V2 : la migration 0080 ajoute linkedin_url +
  // last_enrichment_source + last_enriched_at sur contacts. Les types
  // Supabase generes ne les listent pas tant que `pnpm db:types` n a pas
  // tourne post-push. Cast minimal pour bypasser le typage en attendant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supaAny = supabase as any;
  const { data: contactRaw, error: readErr } = await supaAny
    .from('contacts')
    .select('id, phone, role, first_name, last_name, language, linkedin_url')
    .eq('id', contactId)
    .maybeSingle();
  if (readErr) throw new Error(`Read contact: ${readErr.message}`);
  if (!contactRaw) throw new Error('Contact not found');
  const contact = contactRaw as {
    id: string;
    phone: string | null;
    role: string | null;
    first_name: string | null;
    last_name: string | null;
    language: 'FR' | 'EN' | null;
    linkedin_url: string | null;
  };

  const updates: Record<string, unknown> = {};
  if (!contact.phone && fields.phone) updates.phone = fields.phone;
  if (!contact.role && fields.role) updates.role = fields.role;
  if (!contact.first_name && fields.first_name) updates.first_name = fields.first_name;
  if (!contact.last_name && fields.last_name) updates.last_name = fields.last_name;
  if (!contact.linkedin_url && fields.linkedin_url) updates.linkedin_url = fields.linkedin_url;
  // Language : la colonne MDS est typee 'FR' | 'EN' (enum language_code).
  // On accepte les variantes lower de CoA ('fr'|'en') et on les UPPER.
  if (!contact.language && fields.language) {
    const lang = String(fields.language).toUpperCase();
    if (lang === 'FR' || lang === 'EN') updates.language = lang;
  }

  if (Object.keys(updates).length === 0) {
    return { fieldsUpdated: [] };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('contacts')
    .update({
      ...updates,
      last_enrichment_source: source,
      last_enriched_at: now,
    } as never)
    .eq('id', contactId);
  if (updErr) throw new Error(`Update contact: ${updErr.message}`);

  return { fieldsUpdated: Object.keys(updates) };
}

/**
 * Normalisation email pour matching MDS <-> CoA. LOWER + TRIM symetrique
 * (mirror DB col email_normalized + script d import).
 *
 * Doctrine [[feedback_normalize_name_for_matching]] etendue aux emails.
 */
export function normalizeEmailForMatching(email: string | null | undefined): string | null {
  if (!email) return null;
  const s = email.trim().toLowerCase();
  if (!s || s === 'null' || !s.includes('@')) return null;
  return s;
}
