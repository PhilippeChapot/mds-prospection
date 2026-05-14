/**
 * P5.x.20 — Pull initial Brevo → DB (one-shot).
 *
 * Scenario : récupère TOUS les contacts d'une liste Brevo (par défaut la liste
 * "MDS 2026 - Prospection Standard") et :
 *   - si un contact en DB existe déjà avec le même email → on stocke juste
 *     son `brevo_contact_id` + `last_synced_brevo_at`.
 *   - sinon → on crée le contact en DB, en l'associant à une company existante
 *     trouvée par `primary_domain` (extrait du domaine de l'email). Si aucune
 *     company ne matche, on logge et on SKIP (politique conservative : ne pas
 *     polluer la table companies avec des placeholders).
 *
 * Ce helper n'est PAS appelé depuis un cron — c'est un one-shot manuel à
 * déclencher depuis l'admin UI pour rapatrier les contacts pré-existants chez
 * Brevo (campagnes antérieures, listes historiques) qu'on veut maintenant
 * tracker côté DB.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

const BREVO_API_BASE = 'https://api.brevo.com/v3';
const PAGE_SIZE = 500;
const REQUEST_DELAY_MS = 120;

export interface PullResult {
  fetched: number;
  linked: number;
  created: number;
  skippedNoCompany: number;
  skippedNoEmail: number;
  failed: number;
  errors: Array<{ email?: string; message: string }>;
}

interface BrevoContactRow {
  id: number;
  email: string;
  attributes: Record<string, unknown>;
}

interface BrevoListContactsResponse {
  contacts: BrevoContactRow[];
  count: number;
}

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY missing');
  return key;
}

function getProspectionListId(): number {
  const raw = process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error('BREVO_LIST_PROSPECTION_STANDARD_ID missing or invalid');
  }
  return parsed;
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  return (
    email
      .slice(at + 1)
      .trim()
      .toLowerCase() || null
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchBrevoListPage(
  apiKey: string,
  listId: number,
  offset: number,
): Promise<BrevoListContactsResponse> {
  const res = await fetch(
    `${BREVO_API_BASE}/contacts/lists/${listId}/contacts?limit=${PAGE_SIZE}&offset=${offset}&sort=desc`,
    { headers: { 'api-key': apiKey, accept: 'application/json' } },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`brevo list fetch failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as BrevoListContactsResponse;
}

/**
 * Pull tous les contacts d'une liste Brevo et les materialise en DB.
 *
 * @param options.listId  Liste source. Default = BREVO_LIST_PROSPECTION_STANDARD_ID.
 * @param options.maxPages  Garde-fou pour limiter les appels API (default 20 = 10k contacts max).
 * @param options.createMissingCompanies  Si true, crée une company placeholder
 *   pour les contacts sans match de domaine. Default false (recommandé).
 */
export async function pullContactsFromBrevo(options?: {
  listId?: number;
  maxPages?: number;
  createMissingCompanies?: boolean;
}): Promise<PullResult> {
  const apiKey = getApiKey();
  const listId = options?.listId ?? getProspectionListId();
  const maxPages = options?.maxPages ?? 20;
  const createMissing = options?.createMissingCompanies ?? false;

  const supabase = getSupabaseServiceClient();
  const result: PullResult = {
    fetched: 0,
    linked: 0,
    created: 0,
    skippedNoCompany: 0,
    skippedNoEmail: 0,
    failed: 0,
    errors: [],
  };

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_SIZE;
    let payload: BrevoListContactsResponse;
    try {
      payload = await fetchBrevoListPage(apiKey, listId, offset);
    } catch (err) {
      result.failed += 1;
      result.errors.push({ message: err instanceof Error ? err.message : String(err) });
      break;
    }

    if (!payload.contacts || payload.contacts.length === 0) break;
    result.fetched += payload.contacts.length;

    for (const brevoContact of payload.contacts) {
      const email = brevoContact.email?.trim().toLowerCase();
      if (!email) {
        result.skippedNoEmail += 1;
        continue;
      }

      try {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, brevo_contact_id')
          .ilike('email', email)
          .maybeSingle();

        if (existing) {
          if (existing.brevo_contact_id !== String(brevoContact.id)) {
            const { error: updateErr } = await supabase
              .from('contacts')
              .update({
                brevo_contact_id: String(brevoContact.id),
                last_synced_brevo_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            if (updateErr) {
              result.failed += 1;
              result.errors.push({ email, message: `update failed: ${updateErr.message}` });
              continue;
            }
          }
          result.linked += 1;
          continue;
        }

        // Pas en DB — chercher une company par domaine
        const domain = extractDomain(email);
        let companyId: string | null = null;

        if (domain) {
          const { data: companies } = await supabase
            .from('companies')
            .select('id')
            .or(`primary_domain.ilike.${domain},alternate_domains.cs.{${domain}}`)
            .limit(1);
          companyId = companies?.[0]?.id ?? null;
        }

        if (!companyId && createMissing && domain) {
          const placeholderName = `Brevo import: ${domain}`;
          const { data: created, error: createErr } = await supabase
            .from('companies')
            .insert({
              name: placeholderName,
              name_normalized: placeholderName.toLowerCase(),
              primary_domain: domain,
              category: 'non_eligible',
              pole_classified_by: 'manual',
            })
            .select('id')
            .maybeSingle();
          if (createErr || !created) {
            result.failed += 1;
            result.errors.push({
              email,
              message: `placeholder company create failed: ${createErr?.message ?? 'no row'}`,
            });
            continue;
          }
          companyId = created.id;
        }

        if (!companyId) {
          result.skippedNoCompany += 1;
          continue;
        }

        const attrs = brevoContact.attributes ?? {};
        const firstName = typeof attrs.FIRSTNAME === 'string' ? attrs.FIRSTNAME : null;
        const lastName = typeof attrs.LASTNAME === 'string' ? attrs.LASTNAME : null;
        const sms = typeof attrs.SMS === 'string' ? attrs.SMS : null;
        const langueAttr = typeof attrs.LANGUE === 'string' ? attrs.LANGUE.toUpperCase() : null;
        const language: 'FR' | 'EN' = langueAttr === 'EN' ? 'EN' : 'FR';

        const { error: insertErr } = await supabase.from('contacts').insert({
          company_id: companyId,
          email,
          phone: sms,
          first_name: firstName,
          last_name: lastName,
          language,
          marketing_consent: true,
          lifecycle_emails_enabled: true,
          email_deliverability_status: 'unknown',
          brevo_contact_id: String(brevoContact.id),
          last_synced_brevo_at: new Date().toISOString(),
        });

        if (insertErr) {
          result.failed += 1;
          result.errors.push({ email, message: `insert failed: ${insertErr.message}` });
        } else {
          result.created += 1;
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push({
          email,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Si moins de PAGE_SIZE → fin de pagination
    if (payload.contacts.length < PAGE_SIZE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return result;
}
