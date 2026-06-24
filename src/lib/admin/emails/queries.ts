/**
 * P12.x.EmailIntegration — lectures admin (inbox, détail, comptes, unread).
 * Pas de 'use server' (Server Components). Tables 0106 hors types → cast.
 *
 * RGPD : le body (PII tiers) n'est renvoyé que par getEmailDetail (page
 * preview), jamais dans la liste (snippet seulement).
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type { EmailAccountRow } from '@/lib/email/types';

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

export type EmailFilter = 'all' | 'received' | 'sent' | 'unread' | 'starred' | 'archived';

export interface EmailListItem {
  id: string;
  direction: 'inbound' | 'outbound';
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  has_attachments: boolean;
  account_id: string;
}

const LIST_COLS =
  'id, direction, from_email, from_name, to_emails, subject, snippet, received_at, is_read, is_starred, is_archived, has_attachments, account_id';

export async function listAccountsForUser(userId: string): Promise<EmailAccountRow[]> {
  const db = asAnyDb(getSupabaseServiceClient());
  const { data } = await db
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as EmailAccountRow[];
}

export async function countUnreadForUser(userId: string): Promise<number> {
  const db = asAnyDb(getSupabaseServiceClient());
  const accounts = await listAccountsForUser(userId);
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return 0;
  const { count } = await db
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .in('account_id', ids)
    .eq('is_read', false)
    .eq('is_archived', false);
  return count ?? 0;
}

export async function listEmails(opts: {
  userId: string;
  filter: EmailFilter;
  accountId?: string | null;
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<{ rows: EmailListItem[]; total: number; page: number; perPage: number }> {
  const db = asAnyDb(getSupabaseServiceClient());
  const page = Math.max(1, opts.page ?? 1);
  const perPage = opts.perPage ?? 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const accounts = await listAccountsForUser(opts.userId);
  const accountIds = (opts.accountId ? [opts.accountId] : accounts.map((a) => a.id)).filter(
    Boolean,
  );
  if (accountIds.length === 0) return { rows: [], total: 0, page, perPage };

  let query = db
    .from('emails')
    .select(LIST_COLS, { count: 'exact' })
    .in('account_id', accountIds)
    .order('received_at', { ascending: false })
    .range(from, to);

  if (opts.filter === 'received') query = query.eq('direction', 'inbound');
  else if (opts.filter === 'sent') query = query.eq('direction', 'outbound');
  else if (opts.filter === 'unread') query = query.eq('is_read', false).eq('is_archived', false);
  else if (opts.filter === 'starred') query = query.eq('is_starred', true);
  else if (opts.filter === 'archived') query = query.eq('is_archived', true);
  else query = query.eq('is_archived', false);

  if (opts.q && opts.q.trim().length >= 2) {
    const term = `%${opts.q.trim()}%`;
    query = query.or(`subject.ilike.${term},from_email.ilike.${term},snippet.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[emails/queries] list-failed msg=%s', error.message);
    return { rows: [], total: 0, page, perPage };
  }
  return { rows: (data ?? []) as EmailListItem[], total: count ?? 0, page, perPage };
}

export interface EmailLinkInfo {
  prospect_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  contact_name: string | null;
  company_name: string | null;
}

export interface EmailDetail extends EmailListItem {
  body_html: string | null;
  body_text: string | null;
  message_id: string | null;
  cc_emails: string[];
  email_references: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    size_bytes: number | null;
    signedUrl: string | null;
  }>;
  links: EmailLinkInfo[];
}

export async function getEmailDetail(id: string): Promise<EmailDetail | null> {
  const db = asAnyDb(getSupabaseServiceClient());
  const { data: email } = await db
    .from('emails')
    .select(`${LIST_COLS}, body_html, body_text, message_id, cc_emails, email_references`)
    .eq('id', id)
    .maybeSingle();
  if (!email) return null;

  // Liens (FK uniques contact/company/prospect → pas d'ambiguïté).
  const { data: linkRows } = await db
    .from('email_links')
    .select(
      'prospect_id, contact_id, company_id, contact_ref:contacts(first_name, last_name), company:companies(name)',
    )
    .eq('email_id', id);
  const links: EmailLinkInfo[] = (linkRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const c = Array.isArray(row.contact_ref) ? row.contact_ref[0] : row.contact_ref;
    const co = Array.isArray(row.company) ? row.company[0] : row.company;
    return {
      prospect_id: (row.prospect_id as string | null) ?? null,
      contact_id: (row.contact_id as string | null) ?? null,
      company_id: (row.company_id as string | null) ?? null,
      contact_name: c
        ? [(c as Record<string, unknown>).first_name, (c as Record<string, unknown>).last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || null
        : null,
      company_name: co ? ((co as Record<string, unknown>).name as string) : null,
    };
  });

  // Attachments + signed URLs.
  const { data: attRows } = await db
    .from('email_attachments')
    .select('id, filename, size_bytes, storage_path')
    .eq('email_id', id);
  const attachments = await Promise.all(
    (attRows ?? []).map(async (a) => {
      const row = a as Record<string, unknown>;
      const signed = await db.storage
        .from('email-attachments')
        .createSignedUrl(row.storage_path as string, 3600);
      return {
        id: row.id as string,
        filename: row.filename as string,
        size_bytes: (row.size_bytes as number | null) ?? null,
        signedUrl: signed.data?.signedUrl ?? null,
      };
    }),
  );

  return { ...(email as unknown as EmailDetail), links, attachments };
}

export interface EmailTemplateItem {
  id: string;
  key: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
}

export async function listEmailTemplates(): Promise<EmailTemplateItem[]> {
  const db = asAnyDb(getSupabaseServiceClient());
  const { data } = await db
    .from('email_templates')
    .select('id, key, name, subject, body_html, body_text')
    .eq('is_active', true)
    .order('name', { ascending: true });
  return (data ?? []) as EmailTemplateItem[];
}

export async function listEmailsForProspect(prospectId: string): Promise<EmailListItem[]> {
  const db = asAnyDb(getSupabaseServiceClient());
  const { data: linkRows } = await db
    .from('email_links')
    .select('email_id')
    .eq('prospect_id', prospectId);
  const emailIds = [
    ...new Set((linkRows ?? []).map((r) => (r as Record<string, unknown>).email_id as string)),
  ];
  if (emailIds.length === 0) return [];
  const { data } = await db
    .from('emails')
    .select(LIST_COLS)
    .in('id', emailIds)
    .order('received_at', { ascending: false });
  return (data ?? []) as EmailListItem[];
}
