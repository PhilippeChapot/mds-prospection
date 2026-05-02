/**
 * Brevo (ex-Sendinblue) v3 API client — minimal fetch-based.
 *
 * On evite le SDK officiel (~3 MB, surdimensionne pour 2 endpoints).
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

export async function sendTransactionalEmail(
  input: SendTransactionalEmailParams,
): Promise<SendTransactionalEmailResult> {
  const apiKey = getApiKey();
  const sender = input.sender ?? getDefaultSender();

  const payload = {
    sender,
    to: input.to,
    templateId: input.templateId,
    params: input.params ?? {},
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
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
