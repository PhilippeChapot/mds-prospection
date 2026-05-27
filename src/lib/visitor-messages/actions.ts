'use server';

/**
 * P9.1-natif — server actions pour la messagerie visiteur native.
 *
 * Export rules (Next.js 16) : ce fichier 'use server' n'exporte QUE des
 * async functions (server actions). Les types vivent dans ./types.ts.
 *
 * Actions :
 *   - submitVisitorMessageAction        : PUBLIC, rate-limited par IP
 *   - listVisitorMessagesAction         : admin/sales/super_admin
 *   - getVisitorMessageAction           : admin/sales/super_admin (mark read)
 *   - replyToVisitorMessageAction       : admin/sales/super_admin + Resend
 *   - updateVisitorMessageStatusAction  : admin/sales/super_admin
 *   - countUnreadVisitorMessagesAction  : badge sidebar
 */

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import {
  findOrCreateCompanyForLanding,
  findOrCreateContactForLanding,
} from '@/lib/landing/lead-actions';
import {
  renderAdminVisitorMessageNotification,
  renderVisitorReplyEmail,
} from '@/lib/resend/templates/visitor-reply';
import type {
  ListVisitorMessagesInput,
  ReplyResult,
  SubmitVisitorMessageResult,
  VisitorMessageStatus,
  VisitorMessageWithMeta,
  VisitorMessageReplyRow,
} from './types';

const LOG_PREFIX = '[visitor-messages]';
const PAGE_SIZE = 50;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_MAX = 3;

// ---------------------------------------------------------------------------
// Helpers (internes, async pour respecter 'use server')
// ---------------------------------------------------------------------------

async function clientIpFromHeaders(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip');
}

async function checkRateLimit(ip: string | null): Promise<boolean> {
  if (!ip) return true; // pas d'IP captee = pas de blocage (V1 best-effort)
  const supabase = getSupabaseServiceClient();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('visitor_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('created_at', since);
  return (count ?? 0) < RATE_LIMIT_MAX;
}

// ---------------------------------------------------------------------------
// submitVisitorMessageAction (PUBLIC)
// ---------------------------------------------------------------------------

// P9.1-natif-bis : schema enrichi.
//   - first_name + last_name separes (vs visitor_name unifie)
//   - company REQUIS (CRM-friendly)
//   - company_url optionnel, validee si fournie (URL avec ou sans protocole)
//   - phone OBLIGATOIRE (min 6 chars)
const submitSchema = z.object({
  visitor_first_name: z.string().trim().min(2).max(60),
  visitor_last_name: z.string().trim().min(2).max(60),
  visitor_email: z.string().trim().toLowerCase().email().max(180),
  visitor_company: z.string().trim().min(2).max(120),
  visitor_company_url: z.string().trim().max(300).url().optional().or(z.literal('')),
  visitor_phone: z.string().trim().min(6).max(30),
  message: z.string().trim().min(5).max(2000),
  page_url: z.string().trim().max(500).optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
});

export type SubmitVisitorMessageInput = z.infer<typeof submitSchema>;

export async function submitVisitorMessageAction(
  input: SubmitVisitorMessageInput,
): Promise<SubmitVisitorMessageResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides',
      code: 'invalid',
    };
  }
  const data = parsed.data;

  const ip = await clientIpFromHeaders();
  const h = await headers();
  const userAgent = h.get('user-agent') ?? null;

  // Rate limit (best-effort) : 3 messages / 10 min / IP.
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    console.warn('%s rate-limited ip=%s', LOG_PREFIX, ip);
    return {
      ok: false,
      error:
        data.locale === 'en'
          ? "You've sent several messages already — please wait a few minutes."
          : 'Vous avez déjà envoyé plusieurs messages — merci de patienter quelques minutes.',
      code: 'rate_limit',
    };
  }

  const supabase = getSupabaseServiceClient();

  const companyUrl =
    data.visitor_company_url && data.visitor_company_url !== '' ? data.visitor_company_url : null;

  try {
    // 1. Insert visitor_message (status=new).
    const { data: row, error: insErr } = await supabase
      .from('visitor_messages')
      .insert({
        visitor_first_name: data.visitor_first_name,
        visitor_last_name: data.visitor_last_name,
        visitor_email: data.visitor_email,
        visitor_phone: data.visitor_phone,
        visitor_company: data.visitor_company,
        visitor_company_url: companyUrl,
        message: data.message,
        page_url: data.page_url ?? null,
        locale: data.locale,
        ip_address: ip as never,
        user_agent: userAgent,
        status: 'new',
      })
      .select('id')
      .single();
    if (insErr || !row) {
      console.error('%s insert-failed msg=%s', LOG_PREFIX, insErr?.message);
      return { ok: false, error: "Impossible d'enregistrer votre message, réessayez plus tard." };
    }
    const messageId = row.id;

    // 2. Lead prospect : dedup company + contact via les helpers landing.
    //    P9.1-natif-bis : on a maintenant un vrai nom de societe + URL,
    //    on les utilise pour creer un lead bien qualifie (dedup company
    //    par domaine URL si fourni, sinon par domaine email).
    let prospectId: string | null = null;
    try {
      const company = await findOrCreateCompanyForLanding({
        name: data.visitor_company,
        website: companyUrl,
        contactEmail: data.visitor_email,
      });
      const contact = await findOrCreateContactForLanding({
        email: data.visitor_email,
        firstName: data.visitor_first_name,
        lastName: data.visitor_last_name,
        phone: data.visitor_phone,
        companyId: company.id,
        language: data.locale === 'en' ? 'EN' : 'FR',
      });
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (season) {
        const noteHeader = '[Lead messagerie visiteur native]';
        const pageRef = data.page_url ? `\nPage : ${data.page_url}` : '';
        const notes = `${noteHeader}${pageRef}\n\nMessage :\n${data.message}`;
        const { data: prospect, error: pErr } = await supabase
          .from('prospects')
          .insert({
            season_id: season.id,
            company_id: company.id,
            primary_contact_id: contact.id,
            status: 'lead',
            source: 'chat_visiteur',
            source_detail: data.page_url ?? null,
            notes,
            is_test: false,
          })
          .select('id')
          .single();
        if (pErr) {
          console.warn('%s prospect-insert-failed msg=%s', LOG_PREFIX, pErr.message);
        } else if (prospect) {
          prospectId = prospect.id;
          // Lien visitor_message -> prospect.
          await supabase
            .from('visitor_messages')
            .update({ prospect_id: prospectId })
            .eq('id', messageId);
        }
      }
    } catch (err) {
      // Best-effort : la creation du lead est annexe ; le message reste
      // visible dans l'inbox meme si le lead echoue.
      console.warn(
        '%s lead-creation-failed message=%s msg=%s',
        LOG_PREFIX,
        messageId,
        err instanceof Error ? err.message : String(err),
      );
    }

    // 3. Notif admin (best-effort).
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
      const inboxUrl = `${appUrl}/admin/messages/${messageId}`;
      const tpl = renderAdminVisitorMessageNotification({
        visitorFirstName: data.visitor_first_name,
        visitorLastName: data.visitor_last_name,
        visitorEmail: data.visitor_email,
        visitorPhone: data.visitor_phone,
        visitorCompany: data.visitor_company,
        visitorCompanyUrl: companyUrl,
        message: data.message,
        pageUrl: data.page_url ?? null,
        inboxUrl,
        createdAt: new Date().toLocaleString('fr-FR'),
      });
      await sendAdminNotification('admin_visitor_message', tpl);
    } catch (err) {
      console.warn(
        '%s admin-notif-failed message=%s msg=%s',
        LOG_PREFIX,
        messageId,
        err instanceof Error ? err.message : String(err),
      );
    }

    console.log(
      '%s submitted message=%s prospect=%s email=%s ip=%s',
      LOG_PREFIX,
      messageId,
      prospectId ?? '-',
      data.visitor_email,
      ip ?? '-',
    );

    return { ok: true, message_id: messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('%s submit-failed msg=%s', LOG_PREFIX, msg);
    return { ok: false, error: 'Erreur serveur, réessayez plus tard.' };
  }
}

// ---------------------------------------------------------------------------
// listVisitorMessagesAction (admin/sales/super_admin)
// ---------------------------------------------------------------------------

export async function listVisitorMessagesAction(
  input?: ListVisitorMessagesInput,
): Promise<{ rows: VisitorMessageWithMeta[]; total: number; unread: number }> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('visitor_messages')
    .select(
      `id, visitor_first_name, visitor_last_name, visitor_email, visitor_phone,
       visitor_company, visitor_company_url, message, page_url, locale,
       prospect_id, status, assigned_to_user_id, created_at, read_at, replied_at,
       prospect:prospects(company:companies(name)),
       assignee:users!visitor_messages_assigned_to_user_id_fkey(full_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (input?.status && input.status !== 'all') {
    query = query.eq('status', input.status);
  }
  if (input?.search && input.search.trim().length > 0) {
    const term = `%${input.search.trim()}%`;
    // P9.1-natif-bis : search etendu first/last name + company.
    query = query.or(
      `visitor_first_name.ilike.${term},visitor_last_name.ilike.${term},visitor_email.ilike.${term},visitor_company.ilike.${term},message.ilike.${term}`,
    );
  }

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`listVisitorMessages failed: ${error.message}`);
  }

  const rows: VisitorMessageWithMeta[] = (data ?? []).map((r) => {
    const prospect = pickFirst(r.prospect as unknown);
    const company = pickFirst((prospect as { company?: unknown } | null)?.company);
    const assignee = pickFirst(r.assignee as unknown);
    return {
      id: r.id,
      visitor_first_name: r.visitor_first_name ?? null,
      visitor_last_name: r.visitor_last_name,
      visitor_email: r.visitor_email,
      visitor_phone: r.visitor_phone,
      visitor_company: r.visitor_company ?? null,
      visitor_company_url: r.visitor_company_url ?? null,
      message: r.message,
      page_url: r.page_url,
      locale: (r.locale as 'fr' | 'en') ?? 'fr',
      prospect_id: r.prospect_id,
      status: (r.status as VisitorMessageStatus) ?? 'new',
      assigned_to_user_id: r.assigned_to_user_id,
      created_at: r.created_at,
      read_at: r.read_at,
      replied_at: r.replied_at,
      prospect_company_name: (company as { name?: string } | null)?.name ?? null,
      assigned_to_full_name: (assignee as { full_name?: string } | null)?.full_name ?? null,
    };
  });

  // Unread count (full, non-paged).
  const { count: unreadCount } = await supabase
    .from('visitor_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');

  return { rows, total: count ?? rows.length, unread: unreadCount ?? 0 };
}

export async function countUnreadVisitorMessagesAction(): Promise<number> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { count } = await supabase
    .from('visitor_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// getVisitorMessageAction (admin)
// ---------------------------------------------------------------------------

export async function getVisitorMessageAction({ id }: { id: string }): Promise<{
  message: VisitorMessageWithMeta;
  replies: VisitorMessageReplyRow[];
} | null> {
  await requireAdminProfile();
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('visitor_messages')
    .select(
      `id, visitor_first_name, visitor_last_name, visitor_email, visitor_phone,
       visitor_company, visitor_company_url, message, page_url, locale,
       prospect_id, status, assigned_to_user_id, created_at, read_at, replied_at,
       prospect:prospects(company:companies(name)),
       assignee:users!visitor_messages_assigned_to_user_id_fkey(full_name)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !row) return null;

  // Auto-mark read si encore "new".
  if (row.status === 'new') {
    await supabase
      .from('visitor_messages')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', id);
    row.status = 'read';
    row.read_at = new Date().toISOString();
  }

  const { data: repliesRaw } = await supabase
    .from('visitor_message_replies')
    .select(
      `id, visitor_message_id, sender_user_id, reply_text, email_sent_at, email_resend_id, created_at,
       sender:users!visitor_message_replies_sender_user_id_fkey(full_name, email)`,
    )
    .eq('visitor_message_id', id)
    .order('created_at', { ascending: true });

  const replies: VisitorMessageReplyRow[] = (repliesRaw ?? []).map((r) => {
    const sender = pickFirst(r.sender as unknown) as {
      full_name?: string | null;
      email?: string | null;
    } | null;
    return {
      id: r.id,
      visitor_message_id: r.visitor_message_id,
      sender_user_id: r.sender_user_id,
      sender_full_name: sender?.full_name ?? null,
      sender_email: sender?.email ?? null,
      reply_text: r.reply_text,
      email_sent_at: r.email_sent_at,
      email_resend_id: r.email_resend_id,
      created_at: r.created_at,
    };
  });

  const prospect = pickFirst(row.prospect as unknown);
  const company = pickFirst((prospect as { company?: unknown } | null)?.company);
  const assignee = pickFirst(row.assignee as unknown);

  const message: VisitorMessageWithMeta = {
    id: row.id,
    visitor_first_name: row.visitor_first_name ?? null,
    visitor_last_name: row.visitor_last_name,
    visitor_email: row.visitor_email,
    visitor_phone: row.visitor_phone,
    visitor_company: row.visitor_company ?? null,
    visitor_company_url: row.visitor_company_url ?? null,
    message: row.message,
    page_url: row.page_url,
    locale: (row.locale as 'fr' | 'en') ?? 'fr',
    prospect_id: row.prospect_id,
    status: (row.status as VisitorMessageStatus) ?? 'new',
    assigned_to_user_id: row.assigned_to_user_id,
    created_at: row.created_at,
    read_at: row.read_at,
    replied_at: row.replied_at,
    prospect_company_name: (company as { name?: string } | null)?.name ?? null,
    assigned_to_full_name: (assignee as { full_name?: string } | null)?.full_name ?? null,
  };

  return { message, replies };
}

// ---------------------------------------------------------------------------
// replyToVisitorMessageAction
// ---------------------------------------------------------------------------

const replySchema = z.object({
  message_id: z.string().uuid(),
  reply_text: z.string().trim().min(2).max(5000),
});

export async function replyToVisitorMessageAction(
  input: z.infer<typeof replySchema>,
): Promise<ReplyResult> {
  const profile = await requireAdminProfile();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const supabase = getSupabaseServiceClient();

  // Charger le message original (pour la citation dans l'email).
  const { data: original, error: origErr } = await supabase
    .from('visitor_messages')
    .select('id, visitor_email, visitor_first_name, visitor_last_name, message, locale')
    .eq('id', parsed.data.message_id)
    .maybeSingle();
  if (origErr || !original) {
    return { ok: false, error: 'Message introuvable' };
  }

  // Insert reply.
  const { data: reply, error: replyErr } = await supabase
    .from('visitor_message_replies')
    .insert({
      visitor_message_id: original.id,
      sender_user_id: profile.id,
      reply_text: parsed.data.reply_text,
    })
    .select('id')
    .single();
  if (replyErr || !reply) {
    return { ok: false, error: `Insert reply failed: ${replyErr?.message ?? 'unknown'}` };
  }

  // P9.1-natif-bis : composition du nom (prefer first+last si dispo, sinon last seul).
  const visitorDisplayName =
    [original.visitor_first_name, original.visitor_last_name]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ')
      .trim() || 'visiteur';

  // Envoyer l'email (best-effort : si Resend down, on garde la reply
  // cote DB pour pouvoir reessayer manuellement).
  let emailSent = false;
  let emailId: string | null = null;
  try {
    const tpl = renderVisitorReplyEmail({
      visitorName: visitorDisplayName,
      replyText: parsed.data.reply_text,
      originalMessage: original.message,
      locale: (original.locale === 'en' ? 'en' : 'fr') as 'fr' | 'en',
      senderDisplayName: profile.full_name?.trim() || undefined,
    });
    const result = await sendTransactionalEmailViaResend({
      to: original.visitor_email,
      toName: visitorDisplayName,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: 'philippe@mediadays.solutions',
      tags: [{ name: 'category', value: 'visitor_reply' }],
    });
    emailSent = true;
    emailId = result.id;
    await supabase
      .from('visitor_message_replies')
      .update({ email_sent_at: new Date().toISOString(), email_resend_id: emailId })
      .eq('id', reply.id);
  } catch (err) {
    console.warn(
      '%s reply-email-failed reply=%s msg=%s',
      LOG_PREFIX,
      reply.id,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Update parent status -> replied.
  await supabase
    .from('visitor_messages')
    .update({ status: 'replied', replied_at: new Date().toISOString() })
    .eq('id', original.id);

  // Audit log.
  try {
    await supabase.from('audit_log').insert({
      user_id: profile.id,
      entity_type: 'visitor_messages',
      entity_id: original.id,
      action: 'update',
      before: { status: 'read' } as never,
      after: { status: 'replied', reply_id: reply.id, email_sent: emailSent } as never,
    });
  } catch (err) {
    console.warn(
      '%s audit-log-failed msg=%s',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${original.id}`);

  return { ok: true, reply_id: reply.id, email_sent: emailSent };
}

// ---------------------------------------------------------------------------
// updateVisitorMessageStatusAction (admin/sales)
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  message_id: z.string().uuid(),
  status: z.enum(['new', 'read', 'replied', 'archived']),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
});

export async function updateVisitorMessageStatusAction(
  input: z.infer<typeof statusSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdminProfile();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const supabase = getSupabaseServiceClient();

  const patch: {
    status: VisitorMessageStatus;
    read_at?: string | null;
    assigned_to_user_id?: string | null;
  } = { status: parsed.data.status };
  if (parsed.data.status === 'read') {
    patch.read_at = new Date().toISOString();
  }
  if (parsed.data.assigned_to_user_id !== undefined) {
    patch.assigned_to_user_id = parsed.data.assigned_to_user_id;
  }

  const { error } = await supabase
    .from('visitor_messages')
    .update(patch)
    .eq('id', parsed.data.message_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${parsed.data.message_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internal helper (sync but exported async to satisfy 'use server')
// ---------------------------------------------------------------------------

function pickFirst<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v as T;
}
