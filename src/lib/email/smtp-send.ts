/**
 * P12.x.EmailIntegration — envoi SMTP (Ionos, nodemailer) + INSERT outbound +
 * autoLink. Threading via headers In-Reply-To / References. Node runtime.
 */

import nodemailer from 'nodemailer';
import { type SupabaseClient } from '@supabase/supabase-js';
import { resolveAccountConfig } from './account-config';
import { autoLinkEmail } from './auto-link';
import type { EmailAccountRow } from './types';

export interface SendEmailInput {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string | null;
  references?: string | null;
}

export type SendEmailResult =
  | { ok: true; emailId: string; messageId: string }
  | { ok: false; error: string };

export async function sendEmailFromAccount(
  db: SupabaseClient,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const { data: accountRaw } = await db
    .from('email_accounts')
    .select('*')
    .eq('id', input.accountId)
    .maybeSingle();
  const account = accountRaw as EmailAccountRow | null;
  if (!account) return { ok: false, error: 'Compte introuvable' };

  const resolved = resolveAccountConfig(account);
  if (!resolved) return { ok: false, error: 'Credentials SMTP manquants (env).' };

  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: true,
    auth: { user: account.email, pass: resolved.smtpPassword },
  });

  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers['In-Reply-To'] = input.inReplyTo;
  if (input.references) headers['References'] = input.references;

  let messageId: string;
  try {
    const info = await transport.sendMail({
      from: account.display_name ? `${account.display_name} <${account.email}>` : account.email,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      bcc: input.bcc?.length ? input.bcc : undefined,
      subject: input.subject,
      html: input.bodyHtml,
      text: input.bodyText,
      headers,
    });
    messageId = info.messageId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Envoi SMTP échoué' };
  }

  const { data: row, error } = await db
    .from('emails')
    .insert({
      account_id: input.accountId,
      direction: 'outbound',
      message_id: messageId,
      in_reply_to: input.inReplyTo ?? null,
      email_references: input.references ?? null,
      from_email: account.email.toLowerCase(),
      from_name: account.display_name,
      to_emails: input.to,
      cc_emails: input.cc ?? [],
      bcc_emails: input.bcc ?? [],
      subject: input.subject,
      snippet: (input.bodyText ?? input.bodyHtml.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
      body_text: input.bodyText ?? null,
      body_html: input.bodyHtml,
      is_read: true,
      received_at: new Date().toISOString(),
    } as never)
    .select('id')
    .single();

  if (error || !row?.id) {
    // L'email est parti mais non persisté — log, mais on considère l'envoi OK.
    console.warn('[email/smtp-send] sent-but-not-stored msg=%s', error?.message);
    return { ok: true, emailId: '', messageId };
  }

  const emailId = row.id as string;
  await autoLinkEmail(db, emailId, [...input.to, ...(input.cc ?? [])]);
  return { ok: true, emailId, messageId };
}
