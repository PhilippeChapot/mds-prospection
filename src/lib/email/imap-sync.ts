/**
 * P12.x.EmailIntegration — sync IMAP delta (Ionos) → table emails.
 *
 * Delta par UID (account.last_uid), pagination MAX_PER_RUN pour rester sous la
 * limite 60s Vercel. Parse MIME via mailparser, INSERT inbound + autoLink +
 * attachments (Storage). try/catch → last_error sur le compte. Node runtime.
 *
 * Tables email_* hors types générés (0106) → service client casté any.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { type SupabaseClient } from '@supabase/supabase-js';
import { resolveAccountConfig } from './account-config';
import { autoLinkEmail } from './auto-link';
import type { EmailAccountRow, SyncResult } from './types';

const MAX_PER_RUN = 50;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const LOG_PREFIX = '[email/imap-sync]';

function addrList(value: ParsedMail['to']): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.flatMap((a) => a.value.map((v) => v.address ?? '').filter(Boolean));
}

export async function syncEmailAccount(db: SupabaseClient, accountId: string): Promise<SyncResult> {
  const { data: accountRaw } = await db
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();
  const account = accountRaw as EmailAccountRow | null;
  if (!account)
    return { accountId, email: '?', ok: false, fetched: 0, inserted: 0, error: 'not_found' };

  const resolved = resolveAccountConfig(account);
  if (!resolved) {
    await db
      .from('email_accounts')
      .update({ last_error: 'credentials env manquantes' })
      .eq('id', accountId);
    return {
      accountId,
      email: account.email,
      ok: false,
      fetched: 0,
      inserted: 0,
      error: 'no_creds',
    };
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.email, pass: resolved.imapPassword },
    logger: false,
  });

  let fetched = 0;
  let inserted = 0;
  let maxUid = account.last_uid ?? 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const startUid = (account.last_uid ?? 0) + 1;
      // Collecte les nouveaux UID (cap MAX_PER_RUN) pour borner le temps.
      const messages: Array<{ uid: number; source: Buffer; seen: boolean }> = [];
      for await (const msg of client.fetch(
        { uid: `${startUid}:*` },
        { uid: true, source: true, flags: true },
      )) {
        if (msg.uid < startUid) continue; // `*` peut renvoyer le dernier connu
        messages.push({
          uid: msg.uid,
          source: msg.source as Buffer,
          seen: msg.flags?.has('\\Seen') ?? false,
        });
        if (messages.length >= MAX_PER_RUN) break;
      }

      for (const m of messages) {
        fetched += 1;
        if (m.uid > maxUid) maxUid = m.uid;
        const parsed = await simpleParser(m.source);
        const toEmails = addrList(parsed.to);
        const ccEmails = addrList(parsed.cc);
        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? null;
        const fromName = parsed.from?.value?.[0]?.name ?? null;
        const refs = Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : (parsed.references ?? null);
        const snippet = (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

        const { data: row, error } = await db
          .from('emails')
          .upsert(
            {
              account_id: accountId,
              direction: 'inbound',
              imap_uid: m.uid,
              message_id: parsed.messageId ?? null,
              in_reply_to: parsed.inReplyTo ?? null,
              email_references: refs,
              from_email: fromEmail,
              from_name: fromName,
              to_emails: toEmails,
              cc_emails: ccEmails,
              subject: parsed.subject ?? null,
              snippet,
              body_text: parsed.text ?? null,
              body_html: typeof parsed.html === 'string' ? parsed.html : null,
              has_attachments: (parsed.attachments?.length ?? 0) > 0,
              is_read: m.seen,
              received_at: parsed.date?.toISOString() ?? null,
            } as never,
            { onConflict: 'account_id,imap_uid', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle();

        if (error || !row?.id) continue; // déjà présent (dédup) ou erreur → skip
        inserted += 1;
        const emailId = row.id as string;

        // Auto-link (best-effort).
        await autoLinkEmail(db, emailId, [fromEmail ?? '', ...toEmails]);

        // Attachments (best-effort, skip > 25 Mo).
        for (const att of parsed.attachments ?? []) {
          if (!att.content || (att.size ?? 0) > MAX_ATTACHMENT_BYTES) {
            console.warn(
              '%s attachment-skipped name=%s size=%s',
              LOG_PREFIX,
              att.filename,
              att.size,
            );
            continue;
          }
          const filename = att.filename ?? `attachment-${att.cid ?? 'x'}`;
          const path = `${accountId}/${emailId}/${filename}`;
          const up = await db.storage
            .from('email-attachments')
            .upload(path, att.content, { contentType: att.contentType, upsert: true });
          if (up.error) continue;
          await db.from('email_attachments').insert({
            email_id: emailId,
            filename,
            content_type: att.contentType ?? null,
            size_bytes: att.size ?? null,
            storage_path: path,
          } as never);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await db
      .from('email_accounts')
      .update({
        last_uid: maxUid,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', accountId);

    return { accountId, email: account.email, ok: true, fetched, inserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s failed account=%s msg=%s', LOG_PREFIX, accountId, msg);
    try {
      await client.close();
    } catch {
      /* noop */
    }
    await db.from('email_accounts').update({ last_error: msg }).eq('id', accountId);
    return { accountId, email: account.email, ok: false, fetched, inserted, error: msg };
  }
}
