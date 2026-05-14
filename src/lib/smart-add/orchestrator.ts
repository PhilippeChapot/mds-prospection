/**
 * P5.x.23 — Smart Add Wizard : orchestrateur Phase parse + Phase confirm.
 *
 * Phase parse :
 *   1. Appel Claude Haiku → parsed (person + company + suggested_pole)
 *   2. Fuzzy match société existante via pg_trgm sur name + name_normalized
 *   3. Si pays = FR et company.name → autoMatchSiren INSEE
 *   4. Retourne ParseResult avec tout pré-rempli (UI peut ajuster avant confirm)
 *
 * Phase confirm :
 *   1. Validation Zod stricte du payload (admin-saisi)
 *   2. Si company_mode='new' → INSERT company (avec siren si fourni)
 *   3. Si company_mode='existing' → utilise company_id fourni
 *   4. INSERT contact + sync Brevo (best-effort, P5.x.20 helper)
 *   5. INSERT smart_add_attempts (audit)
 *   6. Retourne ConfirmResult
 *
 * Tout est best-effort : si Brevo fail, on garde l'insert DB (Phil peut
 * retry depuis la fiche société).
 */

import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { parseInputWithAI, type ParsedSmartAdd } from './parse-with-ai';
import { autoMatchSiren, type SireneEtablissement, type AutoMatchResult } from '@/lib/insee/sirene';
import { upsertContactBrevoSingle } from '@/lib/contacts/brevo-single';

const LOG_PREFIX = '[smart-add/orchestrator]';

export interface FuzzyMatchedCompany {
  id: string;
  name: string;
  primary_domain: string | null;
  country: string | null;
  siren: string | null;
  similarity: number;
}

export interface ExistingContactMatch {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  language: 'FR' | 'EN';
  company_id: string;
  company_name: string;
}

export interface ParseResult {
  parsed: ParsedSmartAdd | null;
  fuzzyMatches: FuzzyMatchedCompany[];
  sirenMatch: AutoMatchResult;
  existingContacts: ExistingContactMatch[];
}

async function fuzzyMatchCompanies(name: string | null): Promise<FuzzyMatchedCompany[]> {
  if (!name || name.trim().length < 2) return [];
  const supabase = getSupabaseServiceClient();
  const term = `%${name.trim()}%`;
  // pg_trgm index sur name + name_normalized. On utilise ilike pour rester
  // simple (le GIN index supporte ilike via gin_trgm_ops).
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, primary_domain, country, siren, name_normalized')
    .or(`name.ilike.${term},name_normalized.ilike.${term}`)
    .limit(5);
  if (error) {
    console.error('%s fuzzy-match-failed msg=%s', LOG_PREFIX, error.message);
    return [];
  }
  // Calcul similarité simple : longueur du substring matché / longueur du nom recherché.
  const needle = name.trim().toLowerCase();
  const rows = (data ?? []).map((r) => {
    const hayName = r.name.toLowerCase();
    const hayNorm = (r.name_normalized as string | null)?.toLowerCase() ?? '';
    const inName = hayName.includes(needle);
    const inNorm = hayNorm.includes(needle);
    // Approx similarité (pas du vrai trgm — suffisant pour le tri V1)
    const similarity = inName || inNorm ? Math.min(1, needle.length / hayName.length) : 0;
    return {
      id: r.id,
      name: r.name,
      primary_domain: r.primary_domain,
      country: r.country,
      siren: r.siren,
      similarity,
    };
  });
  return rows.sort((a, b) => b.similarity - a.similarity);
}

/**
 * P5.x.23-ter — recherche les contacts existants matchant par email
 * (case-insensitive). Anti-doublon UX du Smart Add Wizard.
 */
async function findExistingContactsByEmail(email: string | null): Promise<ExistingContactMatch[]> {
  if (!email || email.trim().length < 3 || !email.includes('@')) return [];
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('contacts')
    .select(
      `id, email, first_name, last_name, phone, role, is_primary, language, company_id,
       company:companies!inner(name)`,
    )
    .ilike('email', email.trim())
    .limit(5);
  if (error) {
    console.error('%s existing-contacts-lookup-failed msg=%s', LOG_PREFIX, error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const company = pickFirst(r.company);
    return {
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name,
      phone: r.phone,
      role: r.role,
      is_primary: r.is_primary,
      language: r.language,
      company_id: r.company_id,
      company_name: company?.name ?? '',
    };
  });
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Phase parse : appelle l'IA + fuzzy match DB + INSEE auto-match + dedup contact.
 */
export async function parseSmartAddInput(rawInput: string): Promise<ParseResult> {
  const parsed = await parseInputWithAI(rawInput);

  const fuzzyMatches = parsed?.company.name ? await fuzzyMatchCompanies(parsed.company.name) : [];

  // INSEE seulement si pays FR (ou null/inconnu — on tente, l'API gère).
  let sirenMatch: AutoMatchResult = null;
  if (
    parsed?.company.name &&
    (parsed.company.country === null || parsed.company.country === 'FR')
  ) {
    try {
      sirenMatch = await autoMatchSiren(parsed.company.name);
    } catch (err) {
      console.warn(
        '%s siren-lookup-failed name=%s msg=%s',
        LOG_PREFIX,
        parsed.company.name,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const existingContacts = await findExistingContactsByEmail(parsed?.person.email ?? null);

  return { parsed, fuzzyMatches, sirenMatch, existingContacts };
}

// ---------------------------------------------------------------------------
// Phase confirm
// ---------------------------------------------------------------------------

export const confirmSchema = z.object({
  raw_input: z.string().min(1).max(50000),
  parsed_payload: z.unknown().optional(),
  company_mode: z.enum(['new', 'existing']),
  // mode='new' :
  company_name: z.string().trim().max(300).optional().nullable(),
  company_primary_domain: z.string().trim().max(200).optional().nullable(),
  company_country: z.string().trim().length(2).optional().nullable(),
  company_pole_code: z
    .enum([
      'REGIES_RETAIL_MEDIA',
      'AUDIO_RADIO',
      'DIFFUSION_INFRA',
      'VIDEO_CTV',
      'OUTDOOR_DOOH',
      'DATA_ADTECH',
      'INCONNU',
    ])
    .optional(),
  // P5.x.23-bis : catégorie tarif (uniquement mode='new', n'écrase pas
  // une société existante). Défaut 'standard' (= société à prospecter).
  company_category: z
    .enum(['prs_exhibitor', 'standard', 'non_eligible'])
    .optional()
    .default('standard'),
  // P5.x.23-quater : domaines alternatifs (mode='new' uniquement, n'écrase
  // pas une société existante). Filtre côté serveur si == primary_domain.
  company_alternate_domains: z.array(z.string()).optional().default([]),
  // mode='existing' :
  company_id: z.string().uuid().optional().nullable(),
  // SIREN choisi (auto ou manual select) :
  siren: z
    .string()
    .regex(/^\d{9}$/, 'SIREN = 9 chiffres')
    .optional()
    .nullable(),
  siret: z
    .string()
    .regex(/^\d{14}$/, 'SIRET = 14 chiffres')
    .optional()
    .nullable(),
  siren_source: z.enum(['insee_auto', 'insee_manual_select', 'manual_entry']).optional().nullable(),
  // Contact :
  contact_email: z.string().email(),
  contact_first_name: z.string().trim().max(120).optional().nullable(),
  contact_last_name: z.string().trim().max(120).optional().nullable(),
  contact_phone: z.string().trim().max(40).optional().nullable(),
  contact_role: z.string().trim().max(120).optional().nullable(),
  contact_language: z.enum(['FR', 'EN']).default('FR'),
  contact_is_primary: z.boolean().default(true),
  // P5.x.23-ter : si fourni, on UPDATE ce contact (UPSERT logic) au lieu
  // de tenter une INSERT. Bypass de l'anti-doublon email global.
  contact_existing_id: z.string().uuid().optional().nullable(),
});

export type ConfirmInput = z.infer<typeof confirmSchema>;

export interface ConfirmResult {
  companyId: string;
  contactId: string;
  brevoContactId: string | null;
  brevoKind: string;
  smartAddAttemptId: string;
}

async function findPoleId(code: string): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('poles')
    .select('id')
    .eq('code', code as 'AUDIO_RADIO')
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Phase confirm : crée/utilise company + INSERT contact + sync Brevo + audit.
 */
export async function confirmSmartAdd(
  input: ConfirmInput,
  userId: string,
): Promise<{ ok: true; data: ConfirmResult } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient();

  // 1. Résoudre / créer company
  let companyId: string;
  if (input.company_mode === 'existing') {
    if (!input.company_id) {
      return { ok: false, error: 'company_id requis en mode=existing' };
    }
    const { data: existing } = await supabase
      .from('companies')
      .select('id, siren')
      .eq('id', input.company_id)
      .maybeSingle();
    if (!existing) return { ok: false, error: 'Société introuvable.' };
    companyId = existing.id;

    // Si l'admin a fourni un SIREN et que la company n'en a pas, on l'enrichit.
    if (input.siren && !existing.siren) {
      await supabase
        .from('companies')
        .update({
          siren: input.siren,
          siret: input.siret ?? null,
          siren_verified_at: new Date().toISOString(),
          siren_source: input.siren_source ?? 'manual_entry',
        })
        .eq('id', companyId);
    }
  } else {
    // mode='new'
    if (!input.company_name) {
      return { ok: false, error: 'Nom de société requis en mode=new' };
    }
    const poleId = input.company_pole_code ? await findPoleId(input.company_pole_code) : null;
    const country = input.company_country ?? null;

    // P5.x.23-quater : nettoyage défensif des alternate_domains
    const { cleanDomainList, normalizeDomain } = await import('@/lib/utils/domain');
    const primaryNormalized = input.company_primary_domain
      ? normalizeDomain(input.company_primary_domain)
      : null;
    const altDomains = cleanDomainList(input.company_alternate_domains).filter(
      (d) => d !== primaryNormalized,
    );

    const { data: created, error: createErr } = await supabase
      .from('companies')
      .insert({
        name: input.company_name,
        name_normalized: input.company_name.toLowerCase().trim(),
        primary_domain: primaryNormalized,
        alternate_domains: altDomains,
        country: country ? country.toUpperCase() : null,
        pole_id: poleId,
        pole_classified_by: input.company_pole_code ? 'ai' : 'manual',
        category: input.company_category,
        siren: input.siren ?? null,
        siret: input.siret ?? null,
        siren_verified_at: input.siren ? new Date().toISOString() : null,
        siren_source: input.siren ? (input.siren_source ?? 'insee_auto') : null,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? 'INSERT company failed' };
    }
    companyId = created.id;
  }

  // 2. Contact : 2 chemins selon contact_existing_id
  //    - fourni → UPSERT (enrichit les champs vides via COALESCE-in-JS,
  //      réassigne company_id si Phil a sélectionné une autre société)
  //    - absent → INSERT classique (anti-doublon email strict)
  const email = input.contact_email.toLowerCase().trim();
  let contactId: string;

  if (input.contact_existing_id) {
    // Mode UPSERT : on va UPDATE le contact existant
    const { data: existing, error: lookupErr } = await supabase
      .from('contacts')
      .select('id, company_id, email, first_name, last_name, phone, role, language, is_primary')
      .eq('id', input.contact_existing_id)
      .maybeSingle();
    if (lookupErr || !existing) {
      return { ok: false, error: 'Contact existant introuvable.' };
    }
    // COALESCE-in-JS : on n'écrase QUE les champs nuls/vides en DB
    const patch: {
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      role?: string | null;
      company_id?: string;
      is_primary?: boolean;
    } = {};
    if (!existing.first_name && input.contact_first_name) {
      patch.first_name = input.contact_first_name;
    }
    if (!existing.last_name && input.contact_last_name) {
      patch.last_name = input.contact_last_name;
    }
    if (!existing.phone && input.contact_phone) {
      patch.phone = input.contact_phone;
    }
    if (!existing.role && input.contact_role) {
      patch.role = input.contact_role;
    }
    // Si la société a changé → réassignation (V1 silencieuse, warning log)
    if (existing.company_id !== companyId) {
      console.warn(
        '%s contact-reassigned contact=%s old_company=%s new_company=%s',
        LOG_PREFIX,
        existing.id,
        existing.company_id,
        companyId,
      );
      patch.company_id = companyId;
    }
    // Si l'admin a coché "primary" → dé-primary les autres + set primary
    if (input.contact_is_primary && !existing.is_primary) {
      await supabase
        .from('contacts')
        .update({ is_primary: false })
        .eq('company_id', companyId)
        .eq('is_primary', true);
      patch.is_primary = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from('contacts').update(patch).eq('id', existing.id);
      if (updErr) return { ok: false, error: updErr.message };
    }
    contactId = existing.id;
  } else {
    // Mode INSERT : anti-doublon strict
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, company_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingContact) {
      return {
        ok: false,
        error:
          existingContact.company_id === companyId
            ? 'Ce contact existe déjà sur cette société. Utiliser le mode UPSERT.'
            : 'Cet email est déjà utilisé par un autre contact en base.',
      };
    }

    if (input.contact_is_primary) {
      await supabase
        .from('contacts')
        .update({ is_primary: false })
        .eq('company_id', companyId)
        .eq('is_primary', true);
    }

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        email,
        first_name: input.contact_first_name ?? null,
        last_name: input.contact_last_name ?? null,
        phone: input.contact_phone ?? null,
        role: input.contact_role ?? null,
        language: input.contact_language,
        is_primary: input.contact_is_primary,
        email_deliverability_status: 'unknown',
        marketing_consent: true,
        lifecycle_emails_enabled: true,
      })
      .select('id')
      .single();
    if (contactErr || !contact) {
      return { ok: false, error: contactErr?.message ?? 'INSERT contact failed' };
    }
    contactId = contact.id;
  }

  // 5. Sync Brevo immédiate (best-effort)
  let brevoContactId: string | null = null;
  let brevoKind = 'skipped';
  try {
    const result = await upsertContactBrevoSingle({
      email,
      first_name: input.contact_first_name ?? null,
      last_name: input.contact_last_name ?? null,
      phone: input.contact_phone ?? null,
      language: input.contact_language,
      company_id: companyId,
    });
    brevoKind = result.kind;
    if (result.brevoContactId !== null) {
      brevoContactId = String(result.brevoContactId);
      await supabase
        .from('contacts')
        .update({
          brevo_contact_id: brevoContactId,
          last_synced_brevo_at: new Date().toISOString(),
        })
        .eq('id', contactId);
    }
  } catch (err) {
    console.warn(
      '%s brevo-sync-failed contact=%s msg=%s',
      LOG_PREFIX,
      contactId,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. INSERT smart_add_attempts (audit)
  let smartAddAttemptId = '';
  const { data: attempt } = await supabase
    .from('smart_add_attempts')
    .insert({
      raw_input: input.raw_input,
      parsed_payload: (input.parsed_payload as never) ?? null,
      result: {
        companyId,
        contactId,
        brevoContactId,
        brevoKind,
        siren: input.siren ?? null,
      } as never,
      user_id: userId,
    })
    .select('id')
    .single();
  if (attempt) smartAddAttemptId = attempt.id;

  console.log(
    '%s confirmed company=%s contact=%s brevo=%s/%s',
    LOG_PREFIX,
    companyId,
    contactId,
    brevoKind,
    brevoContactId ?? '-',
  );

  return {
    ok: true,
    data: {
      companyId,
      contactId,
      brevoContactId,
      brevoKind,
      smartAddAttemptId,
    },
  };
}

// Re-export pour les tests
export type { SireneEtablissement };
