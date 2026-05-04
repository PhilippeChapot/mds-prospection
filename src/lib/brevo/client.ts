/**
 * Brevo (ex-Sendinblue) v3 API client — minimal fetch-based.
 *
 * @deprecated POUR LE TRANSACTIONNEL DOI (P3+) : utiliser
 *   `lib/resend/client.ts` a la place. Brevo wrappe les liens dans un
 *   tracker custom (`r.mail.connectonair.com` cote compte Phil) qui
 *   retourne 404 systematiquement, peu importe la longueur de l'URL.
 *   Cf. memoire project_brevo_tracker_bug.md pour le detail.
 *
 * Conserve dormant pour les usages P4+ NON-transactionnels :
 *   - Marketing campaigns / newsletters de masse (le tracking de clic
 *     y est UTILE pour mesurer l'engagement).
 *   - Lifecycle automation (Brevo a de meilleurs flows lifecycle que
 *     Resend a date).
 *   - upsertContact() pour synchroniser le pipeline contacts (P4).
 *
 * On evite le SDK officiel Brevo (~3 MB) — fetch direct suffit.
 * Doc API : https://developers.brevo.com/reference/sendtransacemail
 */

const BREVO_API_BASE = 'https://api.brevo.com/v3';

export class BrevoError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'BrevoError';
    this.status = status;
    this.body = body;
  }
}

interface BrevoSender {
  email: string;
  name?: string;
}

interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface SendTransactionalEmailParams {
  to: BrevoRecipient[];
  templateId: number;
  params?: Record<string, string | number | boolean>;
  sender?: BrevoSender;
  replyTo?: BrevoRecipient;
  tags?: string[];
  /**
   * Headers personnalises ajoutes au mail.
   *
   * IMPORTANT : Brevo REJETTE avec 400 "Invalid headers" tout header dont
   * le nom commence par `sib-`, `mailin-`, `x-mailin-`, ou `x-sib-` (case
   * insensitive). Ces prefixes sont reserves au runtime interne Brevo.
   * On filtre defensivement avant l'envoi.
   *
   * Doc : https://developers.brevo.com/reference/sendtransacemail
   */
  headers?: Record<string, string | number | boolean>;
  /**
   * NO-OP en P3.
   *
   * Le tracking transactionnel ne se desactive PAS via headers API
   * (Brevo rejette tout header X-Mailin-Track* / X-Sib-Track* avec
   * 400 "Invalid headers"). Cf. test reel commit 5988387 -> revert ici.
   *
   * Pour desactiver le tracking d'un template :
   *   - soit au niveau compte : Brevo dashboard > Settings > Tracking
   *     (impacte tous les templates)
   *   - soit configurer un custom tracking domain qui resout correctement
   *     (l'erreur P3 venait du domaine `r.mail.connectonair.com` qui 404)
   *
   * On garde la prop dans l'interface pour garder la trace de l'intention
   * dans le code appelant et pouvoir la cabler proprement plus tard si
   * Brevo ouvre un mecanisme officiel.
   */
  disableTracking?: boolean;
}

export interface SendTransactionalEmailResult {
  messageId: string;
}

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error('BREVO_API_KEY is not configured.');
  }
  return key;
}

function getDefaultSender(): BrevoSender {
  return {
    email: process.env.BREVO_DOI_SENDER_EMAIL ?? 'philippe@mediadays.solutions',
    name: process.env.BREVO_DOI_SENDER_NAME ?? 'MediaDays Solutions',
  };
}

/**
 * Prefixes interdits par Brevo dans le champ `headers` du payload API.
 * Tout header (case insensitive) commencant par un de ces prefixes
 * declenche un 400 "Invalid headers".
 */
const FORBIDDEN_HEADER_PREFIXES = ['sib-', 'mailin-', 'x-mailin-', 'x-sib-'];

function sanitizeHeaders(
  raw: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!raw) return undefined;
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(raw)) {
    const lower = name.toLowerCase();
    const forbidden = FORBIDDEN_HEADER_PREFIXES.some((p) => lower.startsWith(p));
    if (forbidden) {
      console.warn(
        '[brevo] header "%s" filtered out (forbidden prefix sib-/mailin-/x-mailin-/x-sib-)',
        name,
      );
      continue;
    }
    cleaned[name] = value;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailParams,
): Promise<SendTransactionalEmailResult> {
  const apiKey = getApiKey();
  const sender = input.sender ?? getDefaultSender();
  const headers = sanitizeHeaders(input.headers);

  const payload = {
    sender,
    to: input.to,
    templateId: input.templateId,
    params: input.params ?? {},
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(headers ? { headers } : {}),
  };

  const response = await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    throw new BrevoError(
      `Brevo sendTransactionalEmail failed (${response.status})`,
      response.status,
      body,
    );
  }

  const data = (await response.json()) as { messageId: string };
  return { messageId: data.messageId };
}

/**
 * Cree ou met a jour un contact Brevo. Helper prepare pour P4 (sync lifecycle).
 * Pas appele en P3.
 */
export async function upsertContact(
  email: string,
  attributes: Record<string, string | number | boolean | null>,
  listIds?: number[],
): Promise<void> {
  const apiKey = getApiKey();
  const payload = {
    email,
    attributes,
    updateEnabled: true,
    ...(listIds ? { listIds } : {}),
  };

  const response = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // 201 (cree) ou 204 (mis a jour) sont OK.
  if (!response.ok && response.status !== 204) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* noop */
    }
    throw new BrevoError(`Brevo upsertContact failed (${response.status})`, response.status, body);
  }
}

/**
 * IDs des templates DOI cote env. Helper centralise pour eviter
 * d'eparpiller les references.
 */
export function getDoiTemplateId(locale: 'fr' | 'en'): number {
  const id =
    locale === 'fr' ? process.env.BREVO_DOI_TEMPLATE_FR_ID : process.env.BREVO_DOI_TEMPLATE_EN_ID;
  const parsed = id ? Number.parseInt(id, 10) : NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Brevo DOI template id missing for locale "${locale}" (env BREVO_DOI_TEMPLATE_${locale.toUpperCase()}_ID).`,
    );
  }
  return parsed;
}
