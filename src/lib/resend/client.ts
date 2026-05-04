/**
 * Resend client — emails transactionnels critiques.
 *
 * Usage : DOI confirmation (P3), password reset (P3), payment receipts +
 * admin alerts (P4+).
 *
 * Pourquoi Resend plutot que Brevo pour le transactionnel :
 *   - Resend ne wrappe pas les liens dans un tracker custom (Brevo ajoute
 *     un tracker `r.mail.connectonair.com` cote compte Phil qui retourne
 *     404 systematiquement, cf. memoire project_brevo_tracker_bug.md).
 *   - 3000 emails/mois gratuits, suffisant pour P3-P4.
 *   - SDK officiel propre + dashboard observabilite intégré.
 *
 * Pour le marketing / lifecycle / mass campaigns (P4+), continuer a utiliser
 * Brevo (cf. lib/brevo/client.ts qui reste actif pour ces usages).
 */

import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getDefaultSender(): { email: string; name: string } {
  return {
    email: process.env.RESEND_SENDER_EMAIL ?? 'philippe@mediadays.solutions',
    name: process.env.RESEND_SENDER_NAME ?? 'MediaDays Solutions',
  };
}

export interface ResendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Override du replyTo (default = sender). */
  replyTo?: string;
  /** Tags Resend pour observabilite (max 10, valeurs ASCII alphanumeriques + _ -). */
  tags?: { name: string; value: string }[];
}

export interface ResendEmailResult {
  id: string;
}

export class ResendError extends Error {
  body: unknown;
  constructor(message: string, body: unknown) {
    super(message);
    this.name = 'ResendError';
    this.body = body;
  }
}

export async function sendTransactionalEmailViaResend(
  params: ResendEmailParams,
): Promise<ResendEmailResult> {
  const resend = getResendClient();
  const sender = getDefaultSender();

  // Format `from` SDK Resend v6 : string "Name <email@domain>".
  const fromHeader = `${sender.name} <${sender.email}>`;
  const toRecipient = params.toName ? `${params.toName} <${params.to}>` : params.to;

  console.log('[resend] sending email to=%s subject=%s', params.to, params.subject);

  const { data, error } = await resend.emails.send({
    from: fromHeader,
    to: [toRecipient],
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo ?? sender.email,
    ...(params.tags ? { tags: params.tags } : {}),
  });

  if (error || !data) {
    console.error('[resend] send failed:', error);
    throw new ResendError(`Resend send failed: ${error?.message ?? 'unknown'}`, error);
  }

  console.log('[resend] sent successfully id=%s', data.id);
  return { id: data.id };
}
