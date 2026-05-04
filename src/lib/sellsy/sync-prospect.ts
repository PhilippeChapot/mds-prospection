/**
 * Sync Sellsy d'un prospect (P4 M2) — find-or-create company + individual
 * + opportunity, en mode best-effort (3 retries exponentielles).
 *
 * Flow :
 *   1. Lookup prospect + company + contact en DB
 *   2. assertSyncAllowed(prospect, 'sellsy') — bypass si is_test=true
 *   3. Find or create company Sellsy
 *      - Search par primary_domain si renseigne (postgrest-like filter)
 *      - Sinon search par nom (ilike)
 *      - Sinon POST create company
 *      - Stocke companies.sellsy_id
 *   4. Find or create individual Sellsy
 *      - Search par email
 *      - Sinon POST create individual avec linked_to company
 *      - Stocke contacts.sellsy_contact_id
 *   5. Create opportunity Sellsy si pas deja
 *      - POST /opportunities { name, company_id, contact_id, amount, source }
 *      - Stocke prospects.sellsy_opportunity_id
 *   6. UPDATE last_synced_sellsy_at sur prospect/company/contact
 *
 * Erreur finale (apres 3 retries) :
 *   - UPDATE prospects.last_sync_error_message + last_sync_error_provider='sellsy'
 *     + last_sync_error_at
 *   - Notif admin via Brevo (sera cable en P4 M6)
 *
 * Logs structures (prefix [sellsy/sync-prospect]) pour grep Vercel Logs.
 */

import { sellsyFetch } from '@/lib/sellsy/client';
import { withExponentialRetry } from '@/lib/sync/retry';
import { assertSyncAllowed, SyncSkippedError } from '@/lib/sync/skip-if-test';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

interface ProspectForSync {
  id: string;
  is_test: boolean;
  estimated_amount: number | null;
  source_detail: string | null;
  sellsy_opportunity_id: string | null;
  company: {
    id: string;
    name: string;
    primary_domain: string | null;
    sellsy_id: string | null;
  };
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    sellsy_contact_id: string | null;
  } | null;
}

// Sellsy V2 response shapes (minimaux — uniquement les champs qu'on lit).
interface SellsySearchResponse<T> {
  data: T[];
  pagination?: { total?: number };
}
interface SellsyCompany {
  id: number;
  name?: string;
  email?: string | null;
  website?: string | null;
}
interface SellsyIndividual {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}
const LOG_PREFIX = '[sellsy/sync-prospect]';

/**
 * Pipeline Sellsy par defaut pour toutes les opportunites MDS Prospection.
 * Pipeline "defaut" du compte Phil (id 775, 7 steps). Si Phil change de
 * pipeline ou veut un mapping plus fin par pole en P5, basculer ca en
 * env var ou en app_settings.sellsy_pipeline_id.
 *
 * Decouvert via GET /v2/opportunities/pipelines (test curl par Phil).
 */
const SELLSY_PIPELINE_ID = 775;

/**
 * Point d'entree principal. Le caller appelle en background :
 *   void syncProspectToSellsy(prospectId).catch(err => { ... });
 *
 * Le helper gere lui-meme la skip is_test et le UPDATE error en cas d'echec.
 * Il throw uniquement pour permettre au caller (background) de logger un
 * dernier crash si vraiment quelque chose se passe mal hors du retry.
 */
export async function syncProspectToSellsy(prospectId: string): Promise<void> {
  console.log('%s start prospect_id=%s', LOG_PREFIX, prospectId);

  const supabase = getSupabaseServiceClient();

  // 1. Lookup prospect + company + contact
  const { data: row, error: lookupErr } = await supabase
    .from('prospects')
    .select(
      `
      id, is_test, estimated_amount, source_detail, sellsy_opportunity_id,
      company:companies!inner(id, name, primary_domain, sellsy_id),
      contact:contacts(id, first_name, last_name, email, phone, sellsy_contact_id)
      `,
    )
    .eq('id', prospectId)
    .maybeSingle();

  if (lookupErr || !row) {
    console.error(
      '%s lookup-failed prospect_id=%s err=%s',
      LOG_PREFIX,
      prospectId,
      lookupErr?.message,
    );
    return;
  }

  const company = pickFirst(row.company);
  const contact = pickFirst(row.contact);
  if (!company) {
    console.error('%s no-company prospect_id=%s', LOG_PREFIX, prospectId);
    return;
  }

  const prospect: ProspectForSync = {
    id: row.id,
    is_test: row.is_test,
    estimated_amount: row.estimated_amount,
    source_detail: row.source_detail,
    sellsy_opportunity_id: row.sellsy_opportunity_id,
    company: {
      id: company.id,
      name: company.name,
      primary_domain: company.primary_domain,
      sellsy_id: company.sellsy_id,
    },
    contact: contact
      ? {
          id: contact.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          sellsy_contact_id: contact.sellsy_contact_id,
        }
      : null,
  };

  // 2. Skip if test
  try {
    assertSyncAllowed({ id: prospect.id, is_test: prospect.is_test }, 'sellsy');
  } catch (err) {
    if (err instanceof SyncSkippedError) {
      console.log('%s skipped is_test=true prospect_id=%s', LOG_PREFIX, prospectId);
      return;
    }
    throw err;
  }

  // 3. Wrap les appels Sellsy avec retry. onFinalError stocke l'erreur en DB.
  try {
    await withExponentialRetry(
      async () => {
        await runSyncSteps(prospect);
      },
      {
        label: 'sellsy/sync-prospect',
        onFinalError: async (error) => {
          await supabase
            .from('prospects')
            .update({
              last_sync_error_message: truncate(error.message, 1000),
              last_sync_error_provider: 'sellsy',
              last_sync_error_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);
          console.error(
            '%s db-error-saved prospect_id=%s msg=%s',
            LOG_PREFIX,
            prospect.id,
            error.message,
          );
          // P4 M6 : notif admin Brevo (template admin_sync_error). TODO.
        },
      },
    );
  } catch (err) {
    // withExponentialRetry rethrow apres echec final, on swallow ici (best-effort).
    // L'erreur est deja loggee + stockee en DB via onFinalError.
    void err;
    return;
  }

  // 4. Sync OK → clear last_sync_error si etait set + bump last_synced_sellsy_at.
  await supabase
    .from('prospects')
    .update({
      last_synced_sellsy_at: new Date().toISOString(),
      last_sync_error_message: null,
      last_sync_error_provider: null,
      last_sync_error_at: null,
    })
    .eq('id', prospect.id);

  console.log('%s success prospect_id=%s', LOG_PREFIX, prospectId);
}

// ---------------------------------------------------------------------------
// Steps Sellsy (find-or-create + create opportunity)
// ---------------------------------------------------------------------------

async function runSyncSteps(prospect: ProspectForSync): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  // ----- Step 3 : Company -----
  let companySellsyId = prospect.company.sellsy_id;
  if (!companySellsyId) {
    companySellsyId = await findOrCreateSellsyCompany(prospect.company);
    await supabase
      .from('companies')
      .update({ sellsy_id: companySellsyId, last_synced_sellsy_at: nowIso })
      .eq('id', prospect.company.id);
  } else {
    console.log(
      '%s company-existing prospect_id=%s sellsy_id=%s',
      LOG_PREFIX,
      prospect.id,
      companySellsyId,
    );
  }

  // ----- Step 4 : Individual (contact) -----
  if (prospect.contact && !prospect.contact.sellsy_contact_id) {
    const individualSellsyId = await findOrCreateSellsyIndividual(
      prospect.contact,
      companySellsyId,
    );
    await supabase
      .from('contacts')
      .update({ sellsy_contact_id: individualSellsyId, last_synced_sellsy_at: nowIso })
      .eq('id', prospect.contact.id);
  } else if (prospect.contact) {
    console.log(
      '%s contact-existing prospect_id=%s sellsy_contact_id=%s',
      LOG_PREFIX,
      prospect.id,
      prospect.contact.sellsy_contact_id,
    );
  }

  // ----- Step 5 : Opportunity -----
  if (!prospect.sellsy_opportunity_id) {
    const oppId = await createSellsyOpportunity(prospect, companySellsyId);
    await supabase.from('prospects').update({ sellsy_opportunity_id: oppId }).eq('id', prospect.id);
  } else {
    console.log(
      '%s opportunity-existing prospect_id=%s opp_id=%s',
      LOG_PREFIX,
      prospect.id,
      prospect.sellsy_opportunity_id,
    );
  }
}

/**
 * Strategie de matching company en 3 niveaux :
 *   1. Match exact case-insensitive sur le nom complet
 *   2. Match prefix : extraire les 2 premiers mots du nom MDS et chercher
 *      dans Sellsy. Cas reel : MDS = "21 Juin Production", Sellsy = "21 Juin"
 *      (id 52457). Le user MDS a saisi un nom plus complet que Sellsy.
 *      - Si exactement 1 candidat dont le nom Sellsy est CONTENU dans le
 *        nom MDS (ou inversement) -> match auto.
 *      - Si plusieurs candidats -> review manuel (DB error message).
 *   3. CREATE company dans Sellsy.
 *
 * Tests curl confirmes par le user :
 *   - filters.website -> KO ("Ce champ est inconnu")
 *   - filters wrapper obligatoire ("filters est manquant" sans)
 *   - filters.name avec string simple : OK
 */
async function findOrCreateSellsyCompany(company: ProspectForSync['company']): Promise<string> {
  const fullName = company.name.trim();

  // ----- 1. Match exact case-insensitive sur nom complet -----
  const exactCandidates = await searchSellsyCompaniesByName(fullName);
  const exact = exactCandidates.find(
    (c) => normalizeName(c.name ?? '') === normalizeName(fullName),
  );
  if (exact) {
    console.log('%s company-found-exact name=%s sellsy_id=%d', LOG_PREFIX, fullName, exact.id);
    return String(exact.id);
  }

  // ----- 2. Match prefix sur les 2 premiers mots -----
  const words = fullName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const prefix = words.slice(0, 2).join(' ');
    const prefixCandidates = await searchSellsyCompaniesByName(prefix);

    // Filtrer : on garde les candidats dont le nom Sellsy normalise est CONTENU
    // dans fullName, OU dont fullName est contenu dans le nom Sellsy.
    // Couvre les 2 cas : MDS plus complet que Sellsy ("21 Juin Production"
    // matche "21 Juin"), ou inversement.
    const fullNorm = normalizeName(fullName);
    const prefixNorm = normalizeName(prefix);
    const matches = prefixCandidates.filter((c) => {
      const candidateNorm = normalizeName(c.name ?? '');
      if (!candidateNorm) return false;
      if (!candidateNorm.startsWith(prefixNorm)) return false;
      return candidateNorm.includes(fullNorm) || fullNorm.includes(candidateNorm);
    });

    if (matches.length === 1) {
      console.log(
        '%s company-match-by-prefix mds_name=%s sellsy_name=%s sellsy_id=%d',
        LOG_PREFIX,
        fullName,
        matches[0].name,
        matches[0].id,
      );
      return String(matches[0].id);
    }

    if (matches.length > 1) {
      const candidatesDescription = matches
        .slice(0, 5)
        .map((c) => `${c.name ?? '?'} (id ${c.id})`)
        .join(', ');
      console.warn(
        '%s company-multiple-candidates mds_name=%s count=%d candidates=%s',
        LOG_PREFIX,
        fullName,
        matches.length,
        candidatesDescription,
      );
      throw new SellsyManualMatchNeededError(
        `Plusieurs sociétés Sellsy candidates pour "${fullName}" : ${candidatesDescription}. Sélectionner manuellement (UI à venir P4 M2.x).`,
      );
    }
  }

  // ----- 3. CREATE -----
  const createdRaw = await sellsyFetch<unknown>('/companies', {
    method: 'POST',
    body: JSON.stringify({
      name: fullName,
      type: 'client',
    }),
  });
  const newId = extractSellsyId(createdRaw, '/companies');
  console.log('%s company-created mds_name=%s sellsy_id=%d', LOG_PREFIX, fullName, newId);
  return String(newId);
}

/**
 * Search Sellsy companies par nom (filtre obligatoirement wrappe en `filters`).
 * Retourne les candidats Sellsy (jusqu'a 20). Vide si rien.
 *
 * Quirks Sellsy V2 confirmes via curl par Phil :
 *   - `filters` doit etre dans le body (sinon "filters est manquant")
 *   - `limit`, `offset`, `order_by`, `order_direction` doivent etre en
 *     query params (sinon "Ce champ est inconnu" sur le body).
 */
async function searchSellsyCompaniesByName(name: string): Promise<SellsyCompany[]> {
  const res = await sellsyFetch<SellsySearchResponse<SellsyCompany>>('/companies/search?limit=20', {
    method: 'POST',
    body: JSON.stringify({
      filters: { name },
    }),
  });
  return res.data ?? [];
}

async function findOrCreateSellsyIndividual(
  contact: NonNullable<ProspectForSync['contact']>,
  companySellsyId: string,
): Promise<string> {
  // Search par email.
  const found = await searchSellsyIndividualByEmail(contact.email);
  if (found) {
    console.log(
      '%s individual-found-by-email email=%s sellsy_id=%d',
      LOG_PREFIX,
      contact.email,
      found.id,
    );
    return String(found.id);
  }

  // Sinon create avec link to company.
  // Champ `type` requis par Sellsy V2 (3e quirk confirme par 400 "le champ
  // 'type' est manquant"). Valeur 'client' cohérente avec POST /companies
  // qui marche déjà avec type='client', et confirmee par le changelog
  // Sellsy : "for Company & Individual, only client type is allowed" pour
  // les invoices (cf. https://docs.sellsy.com/api/v2/changelog.html).
  const payload = {
    type: 'client',
    first_name: contact.first_name ?? '',
    last_name: contact.last_name ?? contact.email,
    email: contact.email,
    ...(contact.phone ? { phone_number: contact.phone } : {}),
    linked_to: [
      {
        relation_type: 'employee',
        linked_id: Number(companySellsyId),
        linked_type: 'company',
      },
    ],
  };

  const createdRaw = await sellsyFetch<unknown>('/individuals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const newId = extractSellsyId(createdRaw, '/individuals');
  console.log('%s individual-created sellsy_id=%d', LOG_PREFIX, newId);
  return String(newId);
}

async function searchSellsyIndividualByEmail(email: string): Promise<SellsyIndividual | null> {
  // limit en query param (cf. note Sellsy V2 sur searchSellsyCompaniesByName).
  const res = await sellsyFetch<SellsySearchResponse<SellsyIndividual>>(
    '/individuals/search?limit=1',
    {
      method: 'POST',
      body: JSON.stringify({
        filters: { email },
      }),
    },
  );
  return res.data?.[0] ?? null;
}

async function createSellsyOpportunity(
  prospect: ProspectForSync,
  companySellsyId: string,
): Promise<string> {
  const opportunityName = `${prospect.company.name} — Inscription MDS 2026`;

  // Note : champ `source` retire (Sellsy V2 attend probablement un source_id
  // numerique referencant une Source dans le compte, pas une string libre).
  // L'origine de l'opportunite est trace via la note + source_detail cote
  // MDS, c'est suffisant pour P4 M2. A reintegrer en finitions si Phil veut
  // (necessite de lister GET /v2/opportunities/sources et mapper l'id).
  //
  // pipeline_id obligatoire : Sellsy V2 attache toute opportunite a un
  // pipeline (workflow de stages). Default 775 ("defaut" chez Phil, 7 steps).
  // Si Sellsy reclame aussi un step_id, ajouter step.id de la 1ere etape
  // recuperee via GET /v2/opportunities/pipelines/{id}/steps.
  const payload = {
    name: opportunityName,
    type: 'in_progress',
    pipeline_id: SELLSY_PIPELINE_ID,
    company_id: Number(companySellsyId),
    ...(prospect.estimated_amount != null
      ? { estimated_amount: { value: String(prospect.estimated_amount), currency: 'EUR' } }
      : {}),
    note: prospect.source_detail ?? `signup ${prospect.id.slice(0, 8)}`,
  };

  const createdRaw = await sellsyFetch<unknown>('/opportunities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const newId = extractSellsyId(createdRaw, '/opportunities');
  console.log('%s opportunity-created sellsy_id=%d', LOG_PREFIX, newId);
  return String(newId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Sellsy V2 a un comportement non-uniforme entre endpoints :
 *   - Search endpoints (/companies/search, /individuals/search) -> { data: [...] }
 *   - Some create endpoints (/companies) peuvent retourner { data: {...} }
 *   - D'autres create endpoints (/individuals notamment) retournent { id, ... }
 *     directement au top level (confirme par bug "Cannot read properties of
 *     undefined (reading 'id')" en prod sur POST /individuals).
 *
 * Cet helper extrait l'id quel que soit le shape de la response.
 * Throw si introuvable, avec un message qui expose la response brute pour
 * faciliter le debug.
 */
function extractSellsyId(response: unknown, endpoint: string): number {
  if (!response || typeof response !== 'object') {
    throw new Error(
      `Sellsy ${endpoint} response is not an object: ${JSON.stringify(response).slice(0, 200)}`,
    );
  }
  const obj = response as { id?: unknown; data?: { id?: unknown } };
  // Tente data.id (ex: /companies, /companies/search), puis id top-level
  // (ex: /individuals create d'apres test prod).
  const candidate = obj.data?.id ?? obj.id;
  if (typeof candidate !== 'number') {
    throw new Error(
      `Sellsy ${endpoint} response has no numeric id (got ${typeof candidate}): ${JSON.stringify(response).slice(0, 300)}`,
    );
  }
  return candidate;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/**
 * Normalise un nom de societe pour comparaison :
 *   - lowercase
 *   - trim
 *   - collapse espaces multiples
 *   - retire la ponctuation/accents non significative pour le matching
 *
 * Exemples :
 *   "21 Juin Production" -> "21 juin production"
 *   "21  Juin"           -> "21 juin"
 *   "Editions HF — Podcast" -> "editions hf - podcast"
 */
function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/—/g, '-') // tiret long -> tiret simple (uniformise)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Erreur metier : plusieurs candidats Sellsy potentiels pour cette company,
 * besoin d'un match manuel par l'admin (UI a venir P4 M2.x).
 *
 * Pas retryable -> withExponentialRetry n'insiste pas, et le message est
 * stocke en DB via onFinalError. L'admin peut alors agir manuellement.
 *
 * On set un status non-5xx pour que isRetryable() retourne false dans
 * lib/sync/retry.ts (qui ne retry que sur 5xx + 429 + network errors).
 */
class SellsyManualMatchNeededError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'SellsyManualMatchNeededError';
  }
}
