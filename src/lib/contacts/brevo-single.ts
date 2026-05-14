/**
 * P5.x.22 — opérations Brevo sur 1 seul contact (utilisées par les server
 * actions admin /admin/companies/[id]/contacts-actions).
 *
 * Pour la sync batch initiale, voir `brevo-sync.ts` (push N) et
 * `brevo-pull.ts` (pull initial).
 */

const BREVO_API_BASE = 'https://api.brevo.com/v3';

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

function getApiKey(): string | null {
  return process.env.BREVO_API_KEY ?? null;
}

function getProspectionListId(): number | null {
  const raw = process.env.BREVO_LIST_PROSPECTION_STANDARD_ID;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
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

export interface UpsertSingleResult {
  brevoContactId: number | null;
  kind: 'created' | 'linked' | 'updated' | 'skipped';
  message?: string;
}

/**
 * Crée ou récupère un contact Brevo (idempotent). Retourne le brevo_contact_id
 * et `kind` indiquant ce qui s'est passé.
 *
 * - 201 → created (nouveau dans Brevo)
 * - 400 duplicate_parameter → linked (existait déjà, on récupère l'ID via GET)
 * - sinon → skipped (avec `message`)
 *
 * Si BREVO_API_KEY absent → skip silencieux (utile en dev local sans clé).
 */
export async function upsertContactBrevoSingle(contact: {
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  language: string;
  company_id: string;
}): Promise<UpsertSingleResult> {
  const apiKey = getApiKey();
  const listId = getProspectionListId();
  if (!apiKey || !listId) {
    return { brevoContactId: null, kind: 'skipped', message: 'no api key or list id' };
  }

  const attributes = buildAttributes({
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone: contact.phone,
    company_id: contact.company_id,
    language: contact.language,
  });

  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email: contact.email,
      attributes,
      listIds: [listId],
      updateEnabled: false,
    }),
  });

  if (res.status === 201) {
    const data = (await res.json()) as { id: number };
    return { brevoContactId: data.id, kind: 'created' };
  }

  let body: BrevoErrorBody = {};
  try {
    body = (await res.json()) as BrevoErrorBody;
  } catch {
    // empty body
  }
  if (res.status === 400 && body.code === 'duplicate_parameter') {
    const getRes = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(contact.email)}`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (getRes.ok) {
      const data = (await getRes.json()) as { id: number };
      await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ ids: [data.id] }),
      }).catch(() => undefined);
      return { brevoContactId: data.id, kind: 'linked' };
    }
  }
  return {
    brevoContactId: null,
    kind: 'skipped',
    message: body.message ?? `HTTP ${res.status}`,
  };
}

/**
 * PUT /contacts/{email} pour mettre à jour les attributs d'un contact existant.
 * No-op si pas d'API key. Erreur silencieuse pour ne pas casser les actions admin.
 */
export async function updateContactBrevoAttributes(
  email: string,
  contact: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    company_id: string;
    language: string;
  },
): Promise<{ ok: boolean; message?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, message: 'no api key' };

  const attributes = buildAttributes(contact);
  const res = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ attributes }),
  });
  if (res.ok || res.status === 204) return { ok: true };
  let body: BrevoErrorBody = {};
  try {
    body = (await res.json()) as BrevoErrorBody;
  } catch {
    // empty
  }
  return { ok: false, message: body.message ?? `HTTP ${res.status}` };
}

/**
 * Ajoute / retire un contact (par brevo_contact_id) de la liste Prospection
 * Standard. Best-effort, ne propage pas les erreurs.
 */
export async function setContactListMembership(
  brevoContactId: number,
  shouldBeMember: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const apiKey = getApiKey();
  const listId = getProspectionListId();
  if (!apiKey || !listId) return { ok: false, message: 'no api key or list id' };

  const action = shouldBeMember ? 'add' : 'remove';
  const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/${action}`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ ids: [brevoContactId] }),
  });
  if (res.ok || res.status === 204) return { ok: true };
  let body: BrevoErrorBody = {};
  try {
    body = (await res.json()) as BrevoErrorBody;
  } catch {
    // empty
  }
  return { ok: false, message: body.message ?? `HTTP ${res.status}` };
}

/**
 * DELETE /contacts/{email}. Best-effort.
 */
export async function deleteContactBrevo(
  email: string,
): Promise<{ ok: boolean; message?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, message: 'no api key' };
  const res = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { 'api-key': apiKey, accept: 'application/json' },
  });
  if (res.ok || res.status === 204 || res.status === 404) return { ok: true };
  let body: BrevoErrorBody = {};
  try {
    body = (await res.json()) as BrevoErrorBody;
  } catch {
    // empty
  }
  return { ok: false, message: body.message ?? `HTTP ${res.status}` };
}
