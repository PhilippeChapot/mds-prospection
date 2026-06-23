'use server';

/**
 * P5.x.SmartAddApolloEnrichment — flux « décideurs » post-confirmSmartAdd.
 *
 *   - searchApolloDecisionMakersAction : cherche les décideurs ciblés
 *     (APOLLO_TARGET_TITLES) d'une company, priorité France + fallback
 *     global, dédup vs contacts existants, max 5 candidats.
 *   - createContactsFromApolloCandidatesAction : crée les contacts choisis
 *     (email réel Apollo ou placeholder déterministe), dédup + race-safe.
 *
 * Réutilise l'infra Apollo existante (lib/apollo/client, sync-logger) et NE
 * recrée aucun helper. Note 'use server' : exporte uniquement des fonctions
 * async (constantes/types vivent dans target-titles.ts / types.ts).
 */

import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { isApolloEnabled, apolloPeopleSearch, ApolloError } from '@/lib/apollo/client';
import { logApolloCall } from '@/lib/apollo/sync-logger';
import { allTargetTitles, priorityForTitle } from './target-titles';
import type {
  ApolloDecisionMakerCandidate,
  SearchDecisionMakersResult,
  CreateContactsFromApolloResult,
} from './types';

const LOG_PREFIX = '[admin/apollo/decision-makers]';
const MAX_CANDIDATES = 5;
const PLACEHOLDER_DOMAIN = 'apollo-imported.local';

function normalizeName(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function slugifyEmailPart(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 60) || 'x'
  );
}

/** Email Apollo réel uniquement s'il est exploitable (pas verrouillé). */
function realEmailOrNull(email: string | null | undefined, status: string | null | undefined) {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (!e.includes('@') || e.includes('not_unlocked') || e.includes('domain.com')) return null;
  if (status === 'locked') return null;
  return email.trim();
}

// ---------------------------------------------------------------------------
// searchApolloDecisionMakersAction
// ---------------------------------------------------------------------------

const searchSchema = z.object({ company_id: z.string().uuid() });

export async function searchApolloDecisionMakersAction(input: {
  company_id: string;
}): Promise<SearchDecisionMakersResult> {
  await requireAdminProfile();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, candidates: [], error: 'company_id invalide' };
  }
  if (!(await isApolloEnabled())) {
    return {
      ok: false,
      candidates: [],
      error: 'Apollo désactivé (Préférences > Intégrations).',
    };
  }

  const supabase = getSupabaseServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, primary_domain, apollo_organization_id')
    .eq('id', parsed.data.company_id)
    .maybeSingle();

  if (!company) {
    return { ok: false, candidates: [], error: 'Société introuvable' };
  }
  if (!company.apollo_organization_id && !company.primary_domain) {
    return {
      ok: false,
      candidates: [],
      error: 'Pas de domaine ni d’id Apollo sur cette société — enrichissez-la d’abord.',
    };
  }

  const titles = allTargetTitles();

  // Recherche France d'abord, fallback global pour compléter jusqu'à MAX.
  let people;
  try {
    const fr = await apolloPeopleSearch({
      organizationId: company.apollo_organization_id,
      domain: company.primary_domain,
      titles,
      locations: ['France'],
      perPage: 10,
    });
    people = fr;
    if (fr.length < MAX_CANDIDATES) {
      const global = await apolloPeopleSearch({
        organizationId: company.apollo_organization_id,
        domain: company.primary_domain,
        titles,
        perPage: 10,
      });
      // Merge en dédoublonnant par id Apollo (France prioritaire).
      const seen = new Set(fr.map((p) => p.id));
      people = [...fr, ...global.filter((p) => !seen.has(p.id))];
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s search-failed company=%s msg=%s', LOG_PREFIX, company.id, msg);
    await logApolloCall({
      entityType: 'companies',
      entityId: company.id,
      operation: 'pull',
      status: 'error',
      errorMessage: msg,
      payload: { http_status: err instanceof ApolloError ? err.status : null },
    });
    return { ok: false, candidates: [], error: msg };
  }

  // Dédup vs contacts existants de la company (email + nom normalisé).
  const { data: existing } = await supabase
    .from('contacts')
    .select('email, first_name, last_name')
    .eq('company_id', company.id);
  const existingEmails = new Set(
    (existing ?? []).map((c) => (c.email ?? '').toLowerCase()).filter(Boolean),
  );
  const existingNames = new Set(
    (existing ?? []).map((c) =>
      `${normalizeName(c.first_name)} ${normalizeName(c.last_name)}`.trim(),
    ),
  );

  let dedupedCount = 0;
  const candidates: ApolloDecisionMakerCandidate[] = [];
  for (const p of people) {
    const priority = priorityForTitle(p.title);
    if (priority === null) continue; // hors cible (titre non mappé)
    const email = realEmailOrNull(p.email, p.email_status);
    const nameKey = `${normalizeName(p.first_name)} ${normalizeName(p.last_name)}`.trim();
    const isDup =
      (email && existingEmails.has(email.toLowerCase())) || (nameKey && existingNames.has(nameKey));
    if (isDup) {
      dedupedCount += 1;
      continue;
    }
    candidates.push({
      apolloId: p.id,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      title: p.title ?? null,
      linkedinUrl: p.linkedin_url ?? null,
      photoUrl: p.photo_url ?? null,
      email,
      priority,
    });
  }

  // Tri : priorité 1 d'abord, puis ordre Apollo (France first). Max 5.
  candidates.sort((a, b) => a.priority - b.priority);
  const limited = candidates.slice(0, MAX_CANDIDATES);

  await logApolloCall({
    entityType: 'companies',
    entityId: company.id,
    operation: 'pull',
    status: 'success',
    payload: {
      kind: 'decision_makers_search',
      found: people.length,
      candidates: limited.length,
      deduped: dedupedCount,
    },
  });

  return { ok: true, candidates: limited, dedupedCount };
}

// ---------------------------------------------------------------------------
// createContactsFromApolloCandidatesAction
// ---------------------------------------------------------------------------

const candidateSchema = z.object({
  firstName: z.string().trim().max(120).nullable(),
  lastName: z.string().trim().max(120).nullable(),
  title: z.string().trim().max(150).nullable(),
  linkedinUrl: z.string().trim().max(500).nullable(),
  email: z.string().trim().email().max(200).nullable(),
});

const createSchema = z.object({
  company_id: z.string().uuid(),
  candidates: z.array(candidateSchema).min(1).max(MAX_CANDIDATES),
});

export async function createContactsFromApolloCandidatesAction(input: {
  company_id: string;
  candidates: Array<z.infer<typeof candidateSchema>>;
}): Promise<CreateContactsFromApolloResult> {
  const profile = await requireAdminProfile();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      created: 0,
      skipped: 0,
      error: parsed.error.issues[0]?.message ?? 'Invalide',
    };
  }

  const supabase = getSupabaseServiceClient();
  const { data: company } = await supabase
    .from('companies')
    .select('id, primary_domain, name')
    .eq('id', parsed.data.company_id)
    .maybeSingle();
  if (!company) {
    return { ok: false, created: 0, skipped: 0, error: 'Société introuvable' };
  }
  const placeholderBase = slugifyEmailPart(company.primary_domain || company.name || company.id);

  let created = 0;
  let skipped = 0;
  const createdIds: string[] = [];

  for (const c of parsed.data.candidates) {
    const email =
      c.email?.trim() ||
      `apollo.${slugifyEmailPart(`${c.firstName ?? ''}.${c.lastName ?? ''}`)}.${placeholderBase}@${PLACEHOLDER_DOMAIN}`;

    // Dédup applicatif (l'index unique lower(email) est le garde-fou final).
    const { data: dup } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (dup) {
      skipped += 1;
      continue;
    }

    const { data: row, error } = await supabase
      .from('contacts')
      .insert({
        company_id: parsed.data.company_id,
        first_name: c.firstName,
        last_name: c.lastName,
        email,
        role: c.title,
        linkedin_url: c.linkedinUrl,
      } as never)
      .select('id')
      .single();

    if (error) {
      // 23505 = course (un autre insert a posé le même email) → skip propre.
      if ((error as { code?: string }).code === '23505') {
        skipped += 1;
        continue;
      }
      console.error('%s insert-failed company=%s msg=%s', LOG_PREFIX, company.id, error.message);
      return { ok: false, created, skipped, error: error.message };
    }
    created += 1;
    if (row?.id) createdIds.push(row.id as string);
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    action: 'create',
    entity_type: 'contact',
    entity_id: company.id,
    after: {
      kind: 'contact_created_from_apollo',
      company_id: company.id,
      created,
      skipped,
      contact_ids: createdIds,
    } as never,
  });

  return { ok: true, created, skipped };
}
