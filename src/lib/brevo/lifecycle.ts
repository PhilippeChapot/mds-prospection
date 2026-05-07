/**
 * Brevo lifecycle (P4 M6) — synchronisation des contacts pour les flows
 * marketing / nurturing automatique cote Brevo.
 *
 * Distingue du transactionnel (DOI, devis_concierge, admin_*) qui passe par
 * Resend (cf. memoire project_brevo_tracker_bug.md).
 *
 * Fonctions :
 *   - getListIdsForProspect(prospect)  pure -> number[] (testable)
 *   - upsertContactBrevo(input)        POST /v3/contacts (201 cree ou 204 maj)
 *   - addContactToList(id, listId)     POST /v3/contacts/lists/{id}/contacts/add
 *   - removeContactFromList(id, listId) idem .../remove
 *
 * Mode TEST : skip net (pas d'appel Brevo) via assertSyncAllowed.
 *
 * Garde-fou env vars : si BREVO_API_KEY ou les BREVO_LIST_ID_* sont
 * manquants, on log warning et on skip silencieusement (pas d'erreur HTTP
 * cote webhook / post-conversion qui appelle ce helper).
 *
 * Logs structures (prefix [brevo/lifecycle]).
 */

const BREVO_API_BASE = 'https://api.brevo.com/v3';
const LOG_PREFIX = '[brevo/lifecycle]';

export class BrevoLifecycleError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'BrevoLifecycleError';
    this.status = status;
    this.body = body;
  }
}

// ============================================================================
// getListIdsForProspect — pure
// ============================================================================

export type ProspectPole =
  | 'AUDIO_RADIO'
  | 'VIDEO_CTV'
  | 'OUTDOOR_DOOH'
  | 'DIFFUSION_INFRA'
  | 'DATA_ADTECH'
  | 'REGIES_RETAIL_MEDIA'
  | 'INCONNU'
  | null;

export type ProspectCategory = 'prs_exhibitor' | 'standard' | 'non_eligible';

export interface ProspectForLists {
  pole: ProspectPole;
  category: ProspectCategory;
  /** Sera utilise par M7 pour basculer le contact dans BREVO_LIST_ID_SIGNED. */
  isSigned?: boolean;
}

/**
 * Retourne la liste d'IDs Brevo a assigner au contact selon son profil.
 * Pure : ne touche ni l'env ni le reseau pour pouvoir etre teste.
 *
 * Lit les env vars BREVO_LIST_ID_* — si une env var est manquante,
 * elle est silencieusement omise (pas d'erreur). L'admin verra dans les
 * logs warnings la liste des env vars resolues vs manquantes.
 */
export function getListIdsForProspect(prospect: ProspectForLists): number[] {
  const ids: number[] = [];
  const verified = parseListId(process.env.BREVO_LIST_ID_VERIFIED);
  if (verified != null) ids.push(verified);

  const poleEnvKey = poleToEnvKey(prospect.pole);
  if (poleEnvKey) {
    const poleId = parseListId(process.env[poleEnvKey]);
    if (poleId != null) ids.push(poleId);
  }

  if (prospect.category === 'prs_exhibitor') {
    const prs = parseListId(process.env.BREVO_LIST_ID_PRS_ELIGIBLE);
    if (prs != null) ids.push(prs);
  } else if (prospect.category === 'non_eligible') {
    const ne = parseListId(process.env.BREVO_LIST_ID_NON_ELIGIBLE);
    if (ne != null) ids.push(ne);
  }
  // category 'standard' : pas de liste d'eligibilite dediee.

  if (prospect.isSigned) {
    const signed = parseListId(process.env.BREVO_LIST_ID_SIGNED);
    if (signed != null) ids.push(signed);
  }

  return ids;
}

function poleToEnvKey(pole: ProspectPole): string | null {
  switch (pole) {
    case 'AUDIO_RADIO':
      return 'BREVO_LIST_ID_POLE_AUDIO_RADIO';
    case 'VIDEO_CTV':
      return 'BREVO_LIST_ID_POLE_VIDEO_CTV';
    case 'OUTDOOR_DOOH':
      return 'BREVO_LIST_ID_POLE_OUTDOOR_DOOH';
    case 'DIFFUSION_INFRA':
      return 'BREVO_LIST_ID_POLE_DIFFUSION_INFRA';
    case 'DATA_ADTECH':
      return 'BREVO_LIST_ID_POLE_DATA_ADTECH';
    case 'REGIES_RETAIL_MEDIA':
      return 'BREVO_LIST_ID_POLE_REGIES_RETAIL_MEDIA';
    default:
      return null; // INCONNU ou null
  }
}

function parseListId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ============================================================================
// upsertContactBrevo — POST /v3/contacts
// ============================================================================

export interface UpsertBrevoInput {
  /** Used for assertSyncAllowed (skip net si is_test=true). */
  is_test?: boolean;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  pole: ProspectPole;
  category: ProspectCategory;
  language: 'FR' | 'EN';
  marketingConsent: boolean;
  /** Si fourni, override la liste calculee depuis pole/category. */
  listIdsOverride?: number[];
}

export interface UpsertBrevoResult {
  brevoContactId: number | null;
  listIds: number[];
  skipped?: 'is_test' | 'no_api_key';
}

export async function upsertContactBrevo(input: UpsertBrevoInput): Promise<UpsertBrevoResult> {
  if (input.is_test) {
    console.log('%s skipped is_test=true email=%s', LOG_PREFIX, input.email);
    return { brevoContactId: null, listIds: [], skipped: 'is_test' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('%s skip-no-api-key email=%s', LOG_PREFIX, input.email);
    return { brevoContactId: null, listIds: [], skipped: 'no_api_key' };
  }

  const listIds =
    input.listIdsOverride ?? getListIdsForProspect({ pole: input.pole, category: input.category });

  if (listIds.length === 0) {
    console.warn(
      '%s no-lists-resolved email=%s pole=%s category=%s — verifier BREVO_LIST_ID_*',
      LOG_PREFIX,
      input.email,
      input.pole,
      input.category,
    );
  }

  const attributes = {
    FIRSTNAME: input.firstName ?? '',
    LASTNAME: input.lastName ?? '',
    COMPANY: input.companyName ?? '',
    POLE: input.pole ?? 'INCONNU',
    CATEGORY: input.category,
    LANGUAGE: input.language,
    MARKETING_CONSENT: input.marketingConsent,
  };

  const payload = {
    email: input.email,
    attributes,
    listIds: listIds.length > 0 ? listIds : undefined,
    updateEnabled: true,
  };

  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // 201 = cree (renvoie { id }) ; 204 = mis a jour (pas de body) ;
  // 400 = validation error.
  if (res.status === 201) {
    const data = (await res.json()) as { id: number };
    console.log(
      '%s created email=%s contact_id=%d lists=[%s]',
      LOG_PREFIX,
      input.email,
      data.id,
      listIds.join(','),
    );
    return { brevoContactId: data.id, listIds };
  }

  if (res.status === 204) {
    // Aucun id renvoye — on ne le recupere pas pour M6 (pas necessaire pour les
    // flows lifecycle qui s'appuient sur l'email). Si M7 webhook Sellsy a besoin
    // de l'id pour un addContactToList separe, on fera un GET /contacts/{email}.
    console.log('%s updated email=%s lists=[%s]', LOG_PREFIX, input.email, listIds.join(','));
    return { brevoContactId: null, listIds };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* noop */
  }
  throw new BrevoLifecycleError(`Brevo upsertContact failed (${res.status})`, res.status, body);
}

// ============================================================================
// addContactToList / removeContactFromList
// ============================================================================

export async function addContactToList(brevoContactId: number, listId: number): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('%s skip-no-api-key (add to list)', LOG_PREFIX);
    return;
  }
  const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ ids: [brevoContactId] }),
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* noop */
    }
    throw new BrevoLifecycleError(
      `Brevo addContactToList failed (${res.status})`,
      res.status,
      body,
    );
  }
  console.log('%s added contact=%d to list=%d', LOG_PREFIX, brevoContactId, listId);
}

export async function removeContactFromList(brevoContactId: number, listId: number): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('%s skip-no-api-key (remove from list)', LOG_PREFIX);
    return;
  }
  const res = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/remove`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ ids: [brevoContactId] }),
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* noop */
    }
    throw new BrevoLifecycleError(
      `Brevo removeContactFromList failed (${res.status})`,
      res.status,
      body,
    );
  }
  console.log('%s removed contact=%d from list=%d', LOG_PREFIX, brevoContactId, listId);
}
