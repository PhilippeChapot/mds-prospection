'use server';

/**
 * P5.x.ConnectOnAirContactsCache (V2) — server action enrich contact MDS
 * via cache ConnectOnAir (matching email LOWER+TRIM symetrique).
 *
 * RBAC : admin/super_admin uniquement.
 * Upsert if empty : ne JAMAIS ecraser une valeur existante (doctrine).
 * Audit log : kind=contact_connectonair_enrich.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : fichier
 * 'use server' n exporte QUE des async functions. Le helper sync +
 * types vivent dans ./enrich-helpers.ts.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  applyEnrichmentToContact,
  normalizeEmailForMatching,
  type ContactEnrichmentSource,
} from './enrich-helpers';

type EnrichSuccess = {
  ok: true;
  source: ContactEnrichmentSource;
  fieldsUpdated: string[];
  matchEmail?: string;
};

type EnrichFailure = {
  ok: false;
  source: ContactEnrichmentSource | 'none';
  error: string;
  matchEmail?: string;
};

export type ContactEnrichActionResult = EnrichSuccess | EnrichFailure;

const schema = z.object({ contact_id: z.string().uuid() });

// Local type pour le SELECT sur connectonair_directory_contacts. La table
// existe en DB (migration 0080) mais peut ne pas etre encore presente dans
// les types Supabase generes (selon que `pnpm db:types` a tourne ou pas).
// Le SELECT vit dans un cast minimal pour rester safe en attendant la regen.
type CoaContactMatch = {
  id: string;
  email: string | null;
  email_normalized: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  mobile: string | null;
  role: string | null;
  language: string | null;
  linkedin_url: string | null;
  source_user_id: number;
};

export async function enrichContactFromConnectOnAirAction(
  input: z.input<typeof schema>,
): Promise<ContactEnrichActionResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Reserve aux admins.',
    };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      source: 'connectonair',
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
    };
  }

  const supabase = getSupabaseServiceClient();

  // 1) Lecture du contact MDS pour recuperer son email.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('id', parsed.data.contact_id)
    .maybeSingle();
  if (!contact) {
    return { ok: false, source: 'connectonair', error: 'Contact introuvable.' };
  }
  const emailNorm = normalizeEmailForMatching(contact.email);
  if (!emailNorm) {
    return {
      ok: false,
      source: 'connectonair',
      error: "Pas d'email exploitable sur ce contact MDS — impossible de matcher CoA.",
    };
  }

  // 2) Search dans le cache local CoA contacts (email_normalized stricte).
  //    Cast `as any` minimal sur la query : types Supabase peuvent etre
  //    pas encore regen post-0080.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supaAny = supabase as any;
  const { data: matchesRaw } = await supaAny
    .from('connectonair_directory_contacts')
    .select(
      'id, email, email_normalized, first_name, last_name, phone, mobile, role, language, linkedin_url, source_user_id',
    )
    .eq('email_normalized', emailNorm)
    .limit(1);
  const matches = (matchesRaw ?? []) as CoaContactMatch[];

  if (matches.length === 0) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Aucune correspondance email dans le cache ConnectOnAir.',
    };
  }

  const best = matches[0];
  // Fallback phone : phone OU mobile cote CoA.
  const phone = best.phone ?? best.mobile ?? null;

  let result;
  try {
    result = await applyEnrichmentToContact(parsed.data.contact_id, 'connectonair', {
      phone: phone ?? undefined,
      role: best.role ?? undefined,
      first_name: best.first_name ?? undefined,
      last_name: best.last_name ?? undefined,
      linkedin_url: best.linkedin_url ?? undefined,
      language:
        best.language &&
        (best.language.toUpperCase() === 'FR' || best.language.toUpperCase() === 'EN')
          ? (best.language.toUpperCase() as 'FR' | 'EN')
          : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      source: 'connectonair',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (result.fieldsUpdated.length === 0) {
    return {
      ok: false,
      source: 'connectonair',
      error: 'Tous les champs etaient deja remplis (upsert if empty).',
      matchEmail: best.email ?? undefined,
    };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'contacts',
    entity_id: parsed.data.contact_id,
    action: 'update',
    after: {
      kind: 'contact_connectonair_enrich',
      actor_role: profile.role,
      fields_updated: result.fieldsUpdated,
      match_email: best.email,
      match_source_user_id: best.source_user_id,
    } as never,
  });

  revalidatePath(`/admin/contacts/${parsed.data.contact_id}`);
  revalidatePath('/admin/contacts');
  return {
    ok: true,
    source: 'connectonair',
    fieldsUpdated: result.fieldsUpdated,
    matchEmail: best.email ?? undefined,
  };
}
