/**
 * P5.x.ExternalEvents — importer generique consommant un NormalizedImport.
 *
 * Politique :
 *   1. Match strict de la company par normalizedName.
 *   2. Si match : merge external_event_tags (additif, jamais d ecrasement)
 *      + enrichCompanyIfEmpty pour SATIS (et autres ayant enrichment).
 *   3. Si pas de match : create company UNVERIFIED (review_status='unverified')
 *      + tag + enrichment.
 *   4. Pour chaque contact : match par email (lowercase) sinon create.
 *      Si emailConfidence='low' -> prefs marketing/general toutes a false
 *      (RGPD : jamais d envoi sans relecture manuelle).
 *
 * Pas d ecrasement : enrichCompanyIfEmpty ne touche que les champs vides.
 * Idempotent : relancer N fois -> stats identiques apres la 1ere exec.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type {
  NormalizedImport,
  ImportStats,
  ImportEnrichment,
  ImportedContact,
  ImportSource,
} from './types';

type SupabaseClient = ReturnType<typeof getSupabaseServiceClient>;

interface ImportOptions {
  dryRun: boolean;
  /** Pole par defaut (NULL si non specifie -> classification a faire). */
  defaultPoleId?: string | null;
  /** Override client Supabase (utilise par les scripts CLI hors Next). */
  client?: SupabaseClient;
}

export async function importNormalized(
  data: NormalizedImport,
  opts: ImportOptions,
): Promise<ImportStats> {
  const stats: ImportStats = {
    source: data.source,
    dryRun: opts.dryRun,
    matchedCompanies: 0,
    createdCompanies: 0,
    matchedContacts: 0,
    createdContacts: 0,
    enrichedCompanies: 0,
    errors: [],
  };

  const supabase = opts.client ?? getSupabaseServiceClient();
  const importSource: ImportSource = `import_${data.source}` as ImportSource;

  for (const company of data.companies) {
    try {
      const existing = await findCompanyByNormalizedName(supabase, company.normalizedName);

      let companyId: string;
      if (existing) {
        companyId = existing.id;
        stats.matchedCompanies++;

        // Merge tags : never overwrite, just add years.
        if (!opts.dryRun) {
          await mergeExternalEventTag(
            supabase,
            existing.id,
            existing.external_event_tags,
            company.eventKey,
            company.years,
          );
        }

        // Enrich existing (SATIS) without overwriting non-null fields.
        if (company.enrichment) {
          const enriched = await enrichCompanyIfEmpty(
            supabase,
            existing.id,
            company.enrichment,
            opts.dryRun,
          );
          if (enriched.length > 0) stats.enrichedCompanies++;
        }
      } else {
        // Create company UNVERIFIED.
        if (opts.dryRun) {
          stats.createdCompanies++;
        } else {
          const newId = await createUnverifiedCompany(
            supabase,
            company.rawName,
            company.normalizedName,
            company.eventKey,
            company.years,
            company.enrichment,
            data.source,
            opts.defaultPoleId ?? null,
          );
          companyId = newId;
          stats.createdCompanies++;
        }

        if (opts.dryRun) {
          // En dry-run on ne cree pas le company, on saute les contacts.
          stats.createdContacts += company.contacts.filter((c) => c.email).length;
          continue;
        }
        // Pour le typage TS : si on est arrive ici, companyId est defini.
        companyId = companyId!;
      }

      // Contacts.
      for (const ct of company.contacts) {
        if (!ct.email) continue;
        const emailLc = ct.email.toLowerCase().trim();
        if (!emailLc.includes('@')) continue;

        const existingContact = await findContactByEmail(supabase, emailLc);
        if (existingContact) {
          stats.matchedContacts++;
          continue;
        }
        if (!opts.dryRun) {
          await createContact(supabase, companyId, emailLc, ct, importSource);
        }
        stats.createdContacts++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      console.error(`[external-events:${data.source}] error on "${company.rawName}":`, msg);
      stats.errors.push({ rawName: company.rawName, message: msg });
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Helpers internes (exportes pour tests).
// ---------------------------------------------------------------------------

interface CompanyMatch {
  id: string;
  external_event_tags: Record<string, number[]>;
}

export async function findCompanyByNormalizedName(
  supabase: SupabaseClient,
  normalizedName: string,
): Promise<CompanyMatch | null> {
  if (!normalizedName) return null;
  const { data, error } = await supabase
    .from('companies')
    .select('id, external_event_tags, name_normalized')
    .eq('name_normalized', normalizedName)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  const tags = (row.external_event_tags ?? {}) as Record<string, number[]>;
  return { id: row.id, external_event_tags: tags };
}

export async function findContactByEmail(
  supabase: SupabaseClient,
  emailLc: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', emailLc)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id };
}

export async function mergeExternalEventTag(
  supabase: SupabaseClient,
  companyId: string,
  currentTags: Record<string, number[]>,
  eventKey: string,
  years: number[],
): Promise<void> {
  const existing = currentTags[eventKey] ?? [];
  const merged = Array.from(new Set([...existing, ...years])).sort((a, b) => a - b);
  // Idempotent : si pas de changement, on skip l update.
  if (merged.length === existing.length && merged.every((y, i) => y === existing[i])) {
    return;
  }
  const nextTags = { ...currentTags, [eventKey]: merged };
  const { error } = await supabase
    .from('companies')
    .update({ external_event_tags: nextTags })
    .eq('id', companyId);
  if (error) throw new Error(`mergeExternalEventTag failed: ${error.message}`);
}

export async function enrichCompanyIfEmpty(
  supabase: SupabaseClient,
  companyId: string,
  enrichment: ImportEnrichment,
  dryRun: boolean,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('website, country, description')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return [];

  const updates: Record<string, string> = {};

  // Champs deja existants dans le schema companies.
  if (enrichment.website && !data.website) updates.website = enrichment.website;
  if (enrichment.country && !data.country) updates.country = enrichment.country;
  if (enrichment.description && !data.description) {
    updates.description = enrichment.description;
  }

  if (Object.keys(updates).length === 0) return [];
  if (dryRun) return Object.keys(updates);

  const { error: updErr } = await supabase
    .from('companies')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq('id', companyId);
  if (updErr) throw new Error(`enrichCompanyIfEmpty failed: ${updErr.message}`);
  return Object.keys(updates);
}

async function createUnverifiedCompany(
  supabase: SupabaseClient,
  rawName: string,
  normalizedName: string,
  eventKey: string,
  years: number[],
  enrichment: ImportEnrichment | undefined,
  source: string,
  poleId: string | null,
): Promise<string> {
  const sortedYears = Array.from(new Set(years)).sort((a, b) => a - b);
  const insertRow: Record<string, unknown> = {
    name: rawName,
    name_normalized: normalizedName,
    pole_id: poleId,
    category: 'non_eligible',
    external_event_tags: { [eventKey]: sortedYears },
    external_events_review_status: 'unverified',
    external_events_review_source: source,
  };
  if (enrichment) {
    if (enrichment.website) insertRow.website = enrichment.website;
    if (enrichment.country) insertRow.country = enrichment.country;
    if (enrichment.description) insertRow.description = enrichment.description;
  }

  const { data, error } = await supabase
    .from('companies')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertRow as any)
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`createUnverifiedCompany failed: ${error?.message ?? 'no row'}`);
  }
  return data.id;
}

async function createContact(
  supabase: SupabaseClient,
  companyId: string,
  emailLc: string,
  ct: ImportedContact,
  importSource: ImportSource,
): Promise<void> {
  let firstName = ct.firstName ?? null;
  let lastName = ct.lastName ?? null;
  if (!firstName && !lastName && ct.fullName) {
    const parts = ct.fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else if (parts.length === 1) {
      firstName = parts[0];
    }
  }

  const insertRow: Record<string, unknown> = {
    company_id: companyId,
    email: emailLc,
    first_name: firstName,
    last_name: lastName,
    role: ct.role ?? null,
    phone: ct.phone ?? null,
    language: 'FR',
    import_source: importSource,
    email_confidence: ct.emailConfidence,
  };

  // Si confidence low (ex RDE), on coupe les prefs marketing/general
  // (RGPD : aucune campagne automatique sans relecture manuelle).
  if (ct.emailConfidence === 'low') {
    insertRow.marketing_consent = false;
    insertRow.lifecycle_emails_enabled = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('contacts').insert(insertRow as any);
  if (error) {
    // Code 23505 = unique violation (email deja en base, race condition).
    if ((error as { code?: string }).code === '23505') return;
    throw new Error(`createContact(${emailLc}) failed: ${error.message}`);
  }
}
