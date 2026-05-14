/**
 * P5.x.21 — enrichissement des sociétés orphelines via matching domain Brevo.
 *
 * Pour chaque société sans contact en DB et avec primary_domain renseigné,
 * cherche dans Brevo un contact dont l'email a le même domain. Si trouvé,
 * crée un contact générique en DB lié à cette société et l'ajoute à la liste
 * Prospection Standard (#247).
 *
 * Algorithme :
 *   1. SELECT companies sans contact, avec primary_domain non-null.
 *   2. Index orphan domains en Map (primary_domain + alternate_domains).
 *      Filtrage défensif : on rejette tout domain dans free-email-domains
 *      (gmail.com, etc.) pour éviter les matchs massifs sur des sociétés
 *      mal saisies.
 *   3. Pull tous les contacts Brevo paginated (1000/page, ~94 pages pour 94k).
 *      Pour chaque batch, on ne mémoise QUE les contacts dont le domain
 *      correspond à une orpheline (borné en mémoire).
 *   4. Pour chaque orpheline matchée, INSERT contact + ajout à la liste 247
 *      via le helper setContactListMembership (P5.x.20).
 *   5. Idempotent : ré-exécution = recalcule la liste d'orphelines, donc les
 *     sociétés déjà enrichies sont automatiquement skippées.
 *
 * Performance attendue : ~1-2 min pour 94k contacts Brevo + ~230 inserts DB.
 */

import freeProviders from 'free-email-domains';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { setContactListMembership } from './brevo-single';

const LOG_PREFIX = '[brevo-enrich]';
const BREVO_API_BASE = 'https://api.brevo.com/v3';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 110;
const FREE_PROVIDER_SET = new Set<string>(freeProviders as string[]);

interface BrevoContactRow {
  id: number;
  email: string;
  attributes?: Record<string, unknown> | null;
}

interface BrevoListResponse {
  contacts?: BrevoContactRow[];
  count?: number;
}

export interface EnrichResult {
  orphansWithDomain: number;
  orphansSkippedFreeProvider: number;
  brevoTotalScanned: number;
  domainsMatched: number;
  contactsCreated: number;
  domainsNoMatch: number;
  errors: number;
  durationSeconds: number;
}

function getApiKey(): string {
  const k = process.env.BREVO_API_KEY;
  if (!k) throw new Error('BREVO_API_KEY missing');
  return k;
}

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const d = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return d || null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function pickAttr(
  attrs: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!attrs) return null;
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Enrichit les sociétés sans contact en matchant leurs domains contre Brevo.
 *
 * @param options.listIds  Optionnel — si exactement 1 listId fourni, ne
 *   scanne que cette liste (filtre Brevo API). Sinon scanne tous les contacts.
 * @param options.maxEnrichments  Garde-fou : nb max d'inserts par run (default 500).
 * @param options.maxPages  Garde-fou pagination Brevo (default 100 = 100k contacts).
 */
export async function enrichOrphanCompaniesFromBrevo(options?: {
  listIds?: number[];
  maxEnrichments?: number;
  maxPages?: number;
}): Promise<EnrichResult> {
  const startTime = Date.now();
  const apiKey = getApiKey();
  const maxEnrich = options?.maxEnrichments ?? 500;
  const maxPages = options?.maxPages ?? 100;
  const supabase = getSupabaseServiceClient();

  // 1. SELECT companies sans contact + avec primary_domain.
  //    On utilise un embed left-join + filtre côté JS (Supabase JS ne supporte
  //    pas le NOT EXISTS directement).
  const { data: companiesRaw, error: compErr } = await supabase
    .from('companies')
    .select('id, name, primary_domain, alternate_domains, contacts(id)')
    .not('primary_domain', 'is', null);

  if (compErr) {
    throw new Error(`fetch companies failed: ${compErr.message}`);
  }

  const orphans = (companiesRaw ?? []).filter(
    (c) => !c.contacts || (c.contacts as Array<{ id: string }>).length === 0,
  ) as Array<{
    id: string;
    name: string;
    primary_domain: string | null;
    alternate_domains: string[] | null;
  }>;

  // 2. Build Map<domain, orphan>. Skip free-email providers.
  const orphanByDomain = new Map<string, (typeof orphans)[number]>();
  let skippedFreeProvider = 0;

  for (const o of orphans) {
    const candidates: string[] = [];
    if (o.primary_domain) candidates.push(o.primary_domain.toLowerCase().trim());
    for (const alt of o.alternate_domains ?? []) {
      candidates.push(alt.toLowerCase().trim());
    }
    let added = 0;
    for (const d of candidates) {
      if (!d) continue;
      if (FREE_PROVIDER_SET.has(d)) continue;
      if (!orphanByDomain.has(d)) orphanByDomain.set(d, o);
      added += 1;
    }
    if (added === 0) skippedFreeProvider += 1;
  }

  console.log(
    '%s orphans=%d orphan-domains=%d skipped-free-provider=%d',
    LOG_PREFIX,
    orphans.length,
    orphanByDomain.size,
    skippedFreeProvider,
  );

  if (orphanByDomain.size === 0) {
    return {
      orphansWithDomain: orphans.length,
      orphansSkippedFreeProvider: skippedFreeProvider,
      brevoTotalScanned: 0,
      domainsMatched: 0,
      contactsCreated: 0,
      domainsNoMatch: 0,
      errors: 0,
      durationSeconds: Math.round((Date.now() - startTime) / 1000),
    };
  }

  // 3. Pull Brevo paginated, mémoiser uniquement les contacts dont le domain
  //    correspond à une orpheline.
  const brevoContactsByDomain = new Map<string, BrevoContactRow[]>();
  let offset = 0;
  let totalScanned = 0;
  const singleListId = options?.listIds?.length === 1 ? options.listIds[0] : null;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${BREVO_API_BASE}/contacts`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    if (singleListId !== null) {
      url.searchParams.set('listIds', String(singleListId));
    }

    const res = await fetch(url, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Brevo pull failed (${res.status}): ${txt.slice(0, 200)}`);
    }
    const payload = (await res.json()) as BrevoListResponse;
    const batch = payload.contacts ?? [];
    if (batch.length === 0) break;
    totalScanned += batch.length;

    for (const c of batch) {
      const domain = extractDomain(c.email);
      if (!domain) continue;
      if (!orphanByDomain.has(domain)) continue;
      const list = brevoContactsByDomain.get(domain) ?? [];
      list.push(c);
      brevoContactsByDomain.set(domain, list);
    }

    offset += batch.length;
    if (batch.length < PAGE_SIZE) break;
    // Light throttle pour ne pas saturer Brevo
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    '%s scanned=%d matched-domains=%d',
    LOG_PREFIX,
    totalScanned,
    brevoContactsByDomain.size,
  );

  // 4. Pour chaque orpheline matchée, INSERT contact + ajout liste.
  const result: EnrichResult = {
    orphansWithDomain: orphans.length,
    orphansSkippedFreeProvider: skippedFreeProvider,
    brevoTotalScanned: totalScanned,
    domainsMatched: 0,
    contactsCreated: 0,
    domainsNoMatch: 0,
    errors: 0,
    durationSeconds: 0,
  };

  for (const [domain, orphan] of orphanByDomain.entries()) {
    if (result.contactsCreated >= maxEnrich) break;
    const candidates = brevoContactsByDomain.get(domain);
    if (!candidates || candidates.length === 0) {
      result.domainsNoMatch += 1;
      continue;
    }
    result.domainsMatched += 1;
    const chosen = candidates[0];
    const email = chosen.email.toLowerCase().trim();

    // Anti-doublon défensif : si entre temps un autre contact a été inséré
    // avec le même email (multi-runs concurrents), skip.
    const { data: existingByEmail } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingByEmail) {
      result.domainsNoMatch += 1;
      continue;
    }

    try {
      const firstName = pickAttr(chosen.attributes, 'FIRSTNAME', 'PRENOM');
      const lastName = pickAttr(chosen.attributes, 'LASTNAME', 'NOM');
      const phone = pickAttr(chosen.attributes, 'SMS', 'PHONE', 'TELEPHONE');
      const role = pickAttr(chosen.attributes, 'JOB_TITLE', 'FONCTION', 'ROLE');
      const langRaw = pickAttr(chosen.attributes, 'LANGUE', 'LANGUAGE');
      const language: 'FR' | 'EN' = langRaw && langRaw.toUpperCase() === 'EN' ? 'EN' : 'FR';

      const { error: insertErr } = await supabase.from('contacts').insert({
        company_id: orphan.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        language,
        is_primary: true,
        email_verified: false,
        email_deliverability_status: 'unknown',
        marketing_consent: true,
        lifecycle_emails_enabled: true,
        brevo_contact_id: String(chosen.id),
        last_synced_brevo_at: new Date().toISOString(),
      });

      if (insertErr) {
        result.errors += 1;
        console.error(
          '%s insert-failed company=%s email=%s msg=%s',
          LOG_PREFIX,
          orphan.id,
          email,
          insertErr.message,
        );
        continue;
      }

      result.contactsCreated += 1;

      // 5. Ajouter le contact à la liste Prospection Standard. Best-effort.
      await setContactListMembership(chosen.id, true);
      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      result.errors += 1;
      console.error(
        '%s match-failed company=%s domain=%s msg=%s',
        LOG_PREFIX,
        orphan.id,
        domain,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  result.durationSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log(
    '%s done orphans=%d scanned=%d matched=%d created=%d no-match=%d errors=%d duration=%ds',
    LOG_PREFIX,
    result.orphansWithDomain,
    result.brevoTotalScanned,
    result.domainsMatched,
    result.contactsCreated,
    result.domainsNoMatch,
    result.errors,
    result.durationSeconds,
  );

  return result;
}

/**
 * Compte les sociétés orphelines avec primary_domain (pour KPI UI).
 */
export async function countOrphanCompaniesWithDomain(): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('companies')
    .select('id, contacts(id)')
    .not('primary_domain', 'is', null);
  if (error) {
    console.error('%s count-orphans-failed msg=%s', LOG_PREFIX, error.message);
    return 0;
  }
  return (data ?? []).filter(
    (c) => !c.contacts || (c.contacts as Array<{ id: string }>).length === 0,
  ).length;
}
