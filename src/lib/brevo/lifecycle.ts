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
  /**
   * Flags lifecycle (P5.x.4 Phase C). Mutuellement exclusifs avec priorite
   * descendante : isLost > isSigned > isAcomptePaid > isQuoted.
   * Le contact n'est present que dans UNE seule liste lifecycle a la fois,
   * ce qui permet aux automations Brevo de s'arreter naturellement quand
   * la transition suivante est franchie (sortie de liste = exit condition).
   */
  isQuoted?: boolean;
  isAcomptePaid?: boolean;
  isSigned?: boolean;
  isLost?: boolean;
}

/**
 * Retourne la liste d'IDs Brevo a assigner au contact selon son profil.
 * Pure : ne touche ni l'env ni le reseau pour pouvoir etre teste.
 *
 * Lit les env vars BREVO_LIST_ID_* — si une env var est manquante,
 * elle est silencieusement omise (pas d'erreur). L'admin verra dans les
 * logs warnings la liste des env vars resolues vs manquantes.
 *
 * Listes "stables" (verified, pole, eligibility) : toujours presentes
 * tant que le contact existe.
 *
 * Listes "lifecycle" (DEVIS_EMIS, ACOMPTE_PAYE, SIGNED, LOST) : exclusives.
 * A chaque transition de statut, on calcule la liste cible et on retire
 * les autres lifecycle via le mecanisme `unlinkListIds` cote Brevo
 * (cf. upsertContactBrevo).
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

  // Lifecycle : priorite descendante. Un contact perdu n'est plus dans
  // les listes intermediaires, etc.
  if (prospect.isLost) {
    const lost = parseListId(process.env.BREVO_LIST_ID_LOST);
    if (lost != null) ids.push(lost);
  } else if (prospect.isSigned) {
    const signed = parseListId(process.env.BREVO_LIST_ID_SIGNED);
    if (signed != null) ids.push(signed);
  } else if (prospect.isAcomptePaid) {
    const acompte = parseListId(process.env.BREVO_LIST_ID_ACOMPTE_PAYE);
    if (acompte != null) ids.push(acompte);
  } else if (prospect.isQuoted) {
    const devis = parseListId(process.env.BREVO_LIST_ID_DEVIS_EMIS);
    if (devis != null) ids.push(devis);
  }

  return ids;
}

/**
 * Retourne tous les IDs des listes "lifecycle MDS" configurees, tous
 * statuts confondus (VERIFIED_NOT_CONVERTED, DEVIS_EMIS, ACOMPTE_PAYE,
 * SIGNED, LOST).
 *
 * Utilise par upsertContactBrevo pour passer en `unlinkListIds` toutes
 * les listes lifecycle qui ne sont pas dans la cible courante : a la
 * transition `quoted -> acompte_paid`, on ajoute ACOMPTE_PAYE et on
 * retire DEVIS_EMIS automatiquement (exit condition de l'automation
 * Brevo "MDS Devis Emis").
 *
 * P5.x.8 : VERIFIED_NOT_CONVERTED ajoute. Cote signup-side, le contact
 * y entre apres verifyDoi et en sort apres step2 submit / conversion.
 * Cote prospect-side (P5.x.4 sync), `unlinkListIds` retire
 * automatiquement la liste si elle est dans la pool — donc convertir
 * un signup en prospect retire le contact de VERIFIED_NOT_CONVERTED
 * sans handler dedie.
 *
 * Les listes verified/pole/eligibility ne sont JAMAIS dans cette liste —
 * elles sont stables et ne doivent pas etre touchees lors des transitions.
 */
export function getMdsLifecycleListIds(): number[] {
  const ids: number[] = [];
  for (const env of [
    process.env.BREVO_LIST_ID_VERIFIED_NOT_CONVERTED,
    process.env.BREVO_LIST_ID_DEVIS_EMIS,
    process.env.BREVO_LIST_ID_ACOMPTE_PAYE,
    process.env.BREVO_LIST_ID_SIGNED,
    process.env.BREVO_LIST_ID_LOST,
  ]) {
    const id = parseListId(env);
    if (id != null) ids.push(id);
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

  // P5.x.4 Phase C — flags lifecycle pour calcul automatique des listes.
  isQuoted?: boolean;
  isAcomptePaid?: boolean;
  isSigned?: boolean;
  isLost?: boolean;

  // P5.x.4 Phase C — attributs Brevo additionnels utilises par les
  // templates de la sequence "MDS Devis Emis" (J+3/J+7/J+14/J+21).
  // null/undefined -> attribut omis (pas envoye a Brevo).
  sellsyDevisNumber?: string | null;
  sellsyDevisUrl?: string | null;
  sellsyDevisTotalTtc?: number | null;
  /** Date d'emission du devis. Brevo accepte ISO 8601 ; on envoie YYYY-MM-DD. */
  sellsyDevisEmittedAt?: string | Date | null;
  packCode?: string | null;
  acomptePaymentLinkUrl?: string | null;

  // P5.x.8 — URL `etape-2?token=...` pour les emails de relance signup
  // verified non converti. null si pas de short_token disponible.
  signupResumeUrl?: string | null;
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
    input.listIdsOverride ??
    getListIdsForProspect({
      pole: input.pole,
      category: input.category,
      isQuoted: input.isQuoted,
      isAcomptePaid: input.isAcomptePaid,
      isSigned: input.isSigned,
      isLost: input.isLost,
    });

  if (listIds.length === 0) {
    console.warn(
      '%s no-lists-resolved email=%s pole=%s category=%s — verifier BREVO_LIST_ID_*',
      LOG_PREFIX,
      input.email,
      input.pole,
      input.category,
    );
  }

  // unlink : toutes les listes lifecycle qui NE sont PAS dans la cible
  // courante. Permet a Brevo de retirer le contact des automations
  // "MDS Devis Emis" / "MDS Acompte" / etc. lors des transitions de
  // statut. Listes stables (verified/pole/eligibility) jamais touchees.
  const lifecycleIds = getMdsLifecycleListIds();
  const unlinkListIds = lifecycleIds.filter((id) => !listIds.includes(id));

  const attributes = buildAttributes(input);

  const payload: Record<string, unknown> = {
    email: input.email,
    attributes,
    updateEnabled: true,
  };
  if (listIds.length > 0) payload.listIds = listIds;
  if (unlinkListIds.length > 0) payload.unlinkListIds = unlinkListIds;

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
      '%s created email=%s contact_id=%d lists=[%s] unlink=[%s]',
      LOG_PREFIX,
      input.email,
      data.id,
      listIds.join(','),
      unlinkListIds.join(','),
    );
    return { brevoContactId: data.id, listIds };
  }

  if (res.status === 204) {
    // Aucun id renvoye — on ne le recupere pas pour M6 (pas necessaire pour les
    // flows lifecycle qui s'appuient sur l'email). Si M7 webhook Sellsy a besoin
    // de l'id pour un addContactToList separe, on fera un GET /contacts/{email}.
    console.log(
      '%s updated email=%s lists=[%s] unlink=[%s]',
      LOG_PREFIX,
      input.email,
      listIds.join(','),
      unlinkListIds.join(','),
    );
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
// buildAttributes — interne
// ============================================================================

/**
 * Construit le payload `attributes` Brevo. Les champs null/undefined
 * sont omis (Brevo accepte un attribut absent et garde la valeur
 * existante, ce qui evite d'ecraser un attribut precedemment defini
 * par une autre source).
 *
 * Format date Brevo : YYYY-MM-DD pour un attribut de type DATE.
 * `DEVIS_SIGNATURE_DEADLINE` est calcule = sellsyDevisEmittedAt + 21j
 * (deadline de signature commerciale apres laquelle on relance avec
 * un nouveau devis ou on passe au statut perdu).
 */
function buildAttributes(input: UpsertBrevoInput): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    FIRSTNAME: input.firstName ?? '',
    LASTNAME: input.lastName ?? '',
    COMPANY: input.companyName ?? '',
    POLE: input.pole ?? 'INCONNU',
    CATEGORY: input.category,
    LANGUAGE: input.language,
    MARKETING_CONSENT: input.marketingConsent,
  };

  if (input.sellsyDevisNumber != null) {
    attrs.SELLSY_DEVIS_NUMBER = input.sellsyDevisNumber;
  }
  if (input.sellsyDevisUrl != null) {
    attrs.SELLSY_DEVIS_URL = input.sellsyDevisUrl;
  }
  if (input.sellsyDevisTotalTtc != null) {
    attrs.DEVIS_TOTAL_TTC = input.sellsyDevisTotalTtc;
  }
  if (input.sellsyDevisEmittedAt != null) {
    const emittedAt =
      input.sellsyDevisEmittedAt instanceof Date
        ? input.sellsyDevisEmittedAt
        : new Date(input.sellsyDevisEmittedAt);
    if (!Number.isNaN(emittedAt.getTime())) {
      attrs.DEVIS_EMITTED_AT = toBrevoDate(emittedAt);
      const deadline = new Date(emittedAt.getTime() + 21 * 24 * 60 * 60 * 1000);
      attrs.DEVIS_SIGNATURE_DEADLINE = toBrevoDate(deadline);
    }
  }
  if (input.packCode != null) {
    attrs.PACK_CODE = input.packCode;
  }
  if (input.acomptePaymentLinkUrl != null) {
    attrs.ACOMPTE_PAYMENT_LINK_URL = input.acomptePaymentLinkUrl;
  }
  if (input.signupResumeUrl != null) {
    // P5.x.8 — URL de reprise step2 pour les relances Brevo "MDS
    // Verified Pas Converted". Vide -> attribut non envoye, Brevo
    // garde la valeur precedente.
    attrs.SIGNUP_RESUME_URL = input.signupResumeUrl;
  }

  return attrs;
}

function toBrevoDate(d: Date): string {
  // YYYY-MM-DD en UTC. Brevo accepte les attributs DATE dans ce format.
  return d.toISOString().slice(0, 10);
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
