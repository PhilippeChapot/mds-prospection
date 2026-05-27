/**
 * P9.1 — extraction d'un lead depuis un payload webhook Tawk.to.
 *
 * Cible 2 events :
 *   - `ticket:create`           (offline form submission, email obligatoire)
 *   - `chat:transcript_created` (chat termine avec messages, email captured)
 *
 * Les autres events (`chat:start`, `chat:end`) sont reconnus mais ne
 * portent pas (toujours) d'email exploitable ; on les renvoie en
 * `kind='skip'` pour repondre 200 sans creer de lead.
 *
 * Ref doc : https://developer.tawk.to/webhooks/
 */

export interface ExtractedLead {
  /** Email du visiteur (lowercase, trim). */
  email: string;
  /** Nom du visiteur (peut etre vide / fallback "Visiteur chat"). */
  name: string;
  /** Message libre concatene (offline form message, ou messages chat). */
  message: string;
  /** Url de la page d'origine ou du domain de la property (best-effort). */
  pageUrl: string | null;
  /** Tawk.to chat/ticket id (pour idempotence eventuelle V2). */
  externalId: string | null;
}

export type ExtractResult =
  | { kind: 'lead'; lead: ExtractedLead }
  | { kind: 'no_email'; reason: string }
  | { kind: 'skip'; event: string };

/** Liste des events Tawk qu'on accepte en POST. */
const SUPPORTED_EVENTS = [
  'ticket:create',
  'chat:transcript_created',
  'chat:start',
  'chat:end',
] as const;

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function extractLeadFromPayload(payload: unknown): ExtractResult {
  const obj = asObject(payload);
  if (!obj) return { kind: 'skip', event: 'invalid_payload' };
  const event = asString(obj.event) ?? '';

  if (!(SUPPORTED_EVENTS as readonly string[]).includes(event)) {
    return { kind: 'skip', event: event || 'unknown' };
  }

  const property = asObject(obj.property);
  const propertyDomain = asString(property?.name); // souvent le domaine

  if (event === 'ticket:create') {
    const requester = asObject(obj.requester);
    const ticket = asObject(obj.ticket);
    const email = asString(requester?.email);
    const name = asString(requester?.name) ?? 'Visiteur chat';
    const subject = asString(ticket?.subject) ?? '';
    const messageBody = asString(ticket?.message) ?? '';
    const message =
      subject && messageBody && subject !== messageBody
        ? `${subject}\n\n${messageBody}`
        : messageBody || subject || '';
    if (!email) {
      return { kind: 'no_email', reason: 'ticket:create without requester.email' };
    }
    return {
      kind: 'lead',
      lead: {
        email: email.toLowerCase(),
        name,
        message,
        pageUrl: propertyDomain,
        externalId: asString(ticket?.id) ?? asString(ticket?.humanId),
      },
    };
  }

  if (event === 'chat:transcript_created') {
    const chat = asObject(obj.chat);
    const visitor = asObject(chat?.visitor);
    const email = asString(visitor?.email);
    const name = asString(visitor?.name) ?? 'Visiteur chat';
    if (!email) {
      return { kind: 'no_email', reason: 'chat:transcript_created without visitor.email' };
    }
    // Concat des messages visiteur (on ignore les messages agent pour
    // garder le "lead message" intelligible cote admin notif).
    type RawMsg = { sender?: { type?: string } | null; msg?: string; type?: string };
    const messages = asArray<RawMsg>(chat?.messages);
    const visitorMsgs = messages
      .filter((m) => m?.sender?.type === 'visitor' && typeof m.msg === 'string')
      .map((m) => (m.msg as string).trim())
      .filter(Boolean);
    const message = visitorMsgs.join('\n');
    return {
      kind: 'lead',
      lead: {
        email: email.toLowerCase(),
        name,
        message,
        pageUrl: propertyDomain ?? asString(obj.referrer),
        externalId: asString(chat?.id),
      },
    };
  }

  // chat:start / chat:end : on ne capture pas (pas de message ni de
  // garantie d'email a l'ouverture du chat). Skip silencieux.
  return { kind: 'skip', event };
}
