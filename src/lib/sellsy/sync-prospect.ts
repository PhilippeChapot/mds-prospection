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
interface SellsyOpportunity {
  id: number;
  name?: string;
}

const LOG_PREFIX = '[sellsy/sync-prospect]';

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

async function findOrCreateSellsyCompany(company: ProspectForSync['company']): Promise<string> {
  // Search par website (Sellsy V2 supporte filter sur website pour les companies).
  if (company.primary_domain) {
    const found = await searchSellsyCompanyByWebsite(company.primary_domain);
    if (found) {
      console.log(
        '%s company-found-by-domain domain=%s sellsy_id=%d',
        LOG_PREFIX,
        company.primary_domain,
        found.id,
      );
      return String(found.id);
    }
  }

  // Fallback : search par nom exact.
  const foundByName = await searchSellsyCompanyByName(company.name);
  if (foundByName) {
    console.log(
      '%s company-found-by-name name=%s sellsy_id=%d',
      LOG_PREFIX,
      company.name,
      foundByName.id,
    );
    return String(foundByName.id);
  }

  // Sinon create.
  const created = await sellsyFetch<{ data: SellsyCompany }>('/companies', {
    method: 'POST',
    body: JSON.stringify({
      name: company.name,
      type: 'client',
      ...(company.primary_domain ? { website: `https://${company.primary_domain}` } : {}),
    }),
  });
  console.log('%s company-created sellsy_id=%d', LOG_PREFIX, created.data.id);
  return String(created.data.id);
}

async function searchSellsyCompanyByWebsite(domain: string): Promise<SellsyCompany | null> {
  try {
    const res = await sellsyFetch<SellsySearchResponse<SellsyCompany>>('/companies/search', {
      method: 'POST',
      body: JSON.stringify({
        filters: { website: `https://${domain}` },
        limit: 1,
      }),
    });
    return res.data?.[0] ?? null;
  } catch (err) {
    // Si Sellsy ne supporte pas ce filter, on retombe sur search par nom.
    console.warn(
      '%s search-by-website-failed domain=%s msg=%s',
      LOG_PREFIX,
      domain,
      (err as Error).message,
    );
    return null;
  }
}

async function searchSellsyCompanyByName(name: string): Promise<SellsyCompany | null> {
  const res = await sellsyFetch<SellsySearchResponse<SellsyCompany>>('/companies/search', {
    method: 'POST',
    body: JSON.stringify({
      filters: { name: { contains: name } },
      limit: 1,
    }),
  });
  // Match exact (case insensitive) pour eviter de prendre un homonyme partiel.
  const exact = (res.data ?? []).find(
    (c) => (c.name ?? '').toLowerCase().trim() === name.toLowerCase().trim(),
  );
  return exact ?? null;
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
  const payload = {
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

  const created = await sellsyFetch<{ data: SellsyIndividual }>('/individuals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.log('%s individual-created sellsy_id=%d', LOG_PREFIX, created.data.id);
  return String(created.data.id);
}

async function searchSellsyIndividualByEmail(email: string): Promise<SellsyIndividual | null> {
  const res = await sellsyFetch<SellsySearchResponse<SellsyIndividual>>('/individuals/search', {
    method: 'POST',
    body: JSON.stringify({
      filters: { email },
      limit: 1,
    }),
  });
  return res.data?.[0] ?? null;
}

async function createSellsyOpportunity(
  prospect: ProspectForSync,
  companySellsyId: string,
): Promise<string> {
  const opportunityName = `${prospect.company.name} — Inscription MDS 2026`;

  const payload = {
    name: opportunityName,
    type: 'in_progress',
    company_id: Number(companySellsyId),
    ...(prospect.estimated_amount != null
      ? { estimated_amount: { value: String(prospect.estimated_amount), currency: 'EUR' } }
      : {}),
    source: 'inscription_web',
    note: prospect.source_detail ?? `signup ${prospect.id.slice(0, 8)}`,
  };

  const created = await sellsyFetch<{ data: SellsyOpportunity }>('/opportunities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.log('%s opportunity-created sellsy_id=%d', LOG_PREFIX, created.data.id);
  return String(created.data.id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}
