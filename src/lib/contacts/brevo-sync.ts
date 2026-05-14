/**
 * P5.x.20 — Push initial DB → Brevo (one-shot, batchable).
 *
 * Pour chaque contact en base sans `brevo_contact_id`, on tente une création
 * dans Brevo (POST /v3/contacts, updateEnabled=false → on n'écrase JAMAIS
 * les champs d'un contact qui existerait déjà côté Brevo).
 *
 * Si le contact existe déjà côté Brevo (matché par email), on récupère son
 * ID via GET /v3/contacts/{email} et on l'ajoute à la liste "Prospection
 * Standard" — sans écraser ses attributs.
 *
 * Ne JAMAIS écraser :
 *   - l'attribut FIRSTNAME/LASTNAME si Brevo a déjà un nom (notre DB a
 *     souvent NULL pour ces champs sur les contacts génériques importés).
 *   - les autres listes auxquelles le contact appartient.
 *
 * Auth admin requise côté route handler — voir
 * src/app/api/admin/sync-contacts-to-brevo/route.ts.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

const BREVO_API_BASE = 'https://api.brevo.com/v3';
const DEFAULT_BATCH = 100;
const MAX_BATCH = 500;
const REQUEST_DELAY_MS = 80; // ~12 req/s — bien sous la limite Brevo 10/s sur /contacts

export interface SyncResult {
  attempted: number;
  created: number;
  linked: number;
  failed: number;
  errors: Array<{ contactId: string; email: string; status?: number; message: string }>;
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

function buildAttributes(contact: {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_id: string;
  language: string;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (contact.first_name) attrs.FIRSTNAME = contact.first_name;
  if (contact.last_name) attrs.LASTNAME = contact.last_name;
  if (contact.phone) attrs.SMS = contact.phone;
  attrs.COMPANY_ID = contact.company_id;
  attrs.LANGUE = contact.language;
  return attrs;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

interface BrevoCreateResponse {
  id: number;
}

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

async function createBrevoContact(
  apiKey: string,
  email: string,
  attributes: Record<string, string>,
  listId: number,
): Promise<
  | { kind: 'created'; id: number }
  | { kind: 'duplicate' }
  | { kind: 'error'; status: number; message: string }
> {
  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes,
      listIds: [listId],
      updateEnabled: false,
    }),
  });

  if (res.status === 201) {
    const data = (await res.json()) as BrevoCreateResponse;
    return { kind: 'created', id: data.id };
  }

  let body: BrevoErrorBody = {};
  try {
    body = (await res.json()) as BrevoErrorBody;
  } catch {
    // empty body
  }
  if (res.status === 400 && body.code === 'duplicate_parameter') {
    return { kind: 'duplicate' };
  }
  return { kind: 'error', status: res.status, message: body.message ?? `HTTP ${res.status}` };
}

async function lookupBrevoContactId(apiKey: string, email: string): Promise<number | null> {
  const res = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
    headers: { 'api-key': apiKey, accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id: number };
  return data.id;
}

async function addEmailToList(apiKey: string, email: string, listId: number): Promise<void> {
  await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ emails: [email] }),
  }).catch(() => {
    // best effort — si le contact y est déjà, Brevo renvoie 400 mais on ne propage pas
  });
}

/**
 * Compte le nombre de contacts en DB SANS brevo_contact_id (= reste à pousser).
 */
export async function countUnsyncedContacts(): Promise<number> {
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .is('brevo_contact_id', null);
  if (error) throw new Error(`countUnsyncedContacts: ${error.message}`);
  return count ?? 0;
}

/**
 * Pousse un batch de contacts DB → Brevo. Retourne un résumé chiffré.
 *
 * @param options.limit  Nombre max de contacts à traiter (default 100, max 500)
 * @param options.skipDeliverabilityInvalid  Si true, ignore les contacts dont
 *   l'email_deliverability_status est 'invalid' (recommandé pour éviter de
 *   polluer la base Brevo). Default true.
 */
export async function syncContactsToBrevo(options?: {
  limit?: number;
  skipDeliverabilityInvalid?: boolean;
}): Promise<SyncResult> {
  const apiKey = getApiKey();
  const listId = getProspectionListId();
  const limit = Math.min(options?.limit ?? DEFAULT_BATCH, MAX_BATCH);
  const skipInvalid = options?.skipDeliverabilityInvalid ?? true;

  const supabase = getSupabaseServiceClient();
  const query = supabase
    .from('contacts')
    .select(
      'id, email, first_name, last_name, phone, language, company_id, email_deliverability_status',
    )
    .is('brevo_contact_id', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  const { data: contacts, error } = await query;
  if (error) throw new Error(`syncContactsToBrevo: ${error.message}`);
  if (!contacts || contacts.length === 0) {
    return { attempted: 0, created: 0, linked: 0, failed: 0, errors: [] };
  }

  const result: SyncResult = {
    attempted: 0,
    created: 0,
    linked: 0,
    failed: 0,
    errors: [],
  };

  for (const contact of contacts) {
    if (skipInvalid && contact.email_deliverability_status === 'invalid') {
      continue;
    }
    result.attempted += 1;

    try {
      const attrs = buildAttributes({
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone: contact.phone,
        company_id: contact.company_id,
        language: contact.language,
      });

      let brevoId: number | null = null;

      const created = await createBrevoContact(apiKey, contact.email, attrs, listId);
      if (created.kind === 'created') {
        brevoId = created.id;
        result.created += 1;
      } else if (created.kind === 'duplicate') {
        const existingId = await lookupBrevoContactId(apiKey, contact.email);
        if (existingId !== null) {
          brevoId = existingId;
          result.linked += 1;
          await addEmailToList(apiKey, contact.email, listId);
        } else {
          result.failed += 1;
          result.errors.push({
            contactId: contact.id,
            email: contact.email,
            message: 'duplicate but lookup failed',
          });
        }
      } else {
        result.failed += 1;
        result.errors.push({
          contactId: contact.id,
          email: contact.email,
          status: created.status,
          message: created.message,
        });
      }

      if (brevoId !== null) {
        const { error: updateErr } = await supabase
          .from('contacts')
          .update({
            brevo_contact_id: String(brevoId),
            last_synced_brevo_at: new Date().toISOString(),
          })
          .eq('id', contact.id);
        if (updateErr) {
          result.errors.push({
            contactId: contact.id,
            email: contact.email,
            message: `db update failed: ${updateErr.message}`,
          });
        }
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        contactId: contact.id,
        email: contact.email,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return result;
}
