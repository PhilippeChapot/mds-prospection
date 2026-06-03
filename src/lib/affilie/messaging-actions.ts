'use server';

/**
 * P7.x.AffiliePitchsAndChat — server actions messagerie pour l affilie.
 *
 * Reutilise l infra P9.2 (internal_conversations + conversation_participants
 * + internal_messages + trigger bump_last_message_at + notif Resend), mais :
 *
 *   - type = 'staff_affilie' (etendu via migration 0072)
 *   - created_by_type / participant_type / sender_type = 'affiliate' (etendus
 *     via migration 0073)
 *   - metadata.affiliate_id (JSONB) : identifie l affilie createur, utilise
 *     pour le filtrage RGPD strict (affilie A ne voit JAMAIS les conv de B)
 *
 * Auth : cookie JWT `affilie_session` (pas Supabase auth) via
 * requireAffilieSession. Bypass RLS via service-role client.
 *
 * Notif Resend symetrique :
 *   - affilie envoie  -> notif aux admins staff (admin_notification_emails)
 *   - staff repond    -> notif a l affilie (affiliates.contact_email)
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderInternalMessageNotification } from '@/lib/resend/templates/internal-message-notification';
import { requireAffilieSession } from './session';

const LOG_PREFIX = '[affilie/messaging]';

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// listMyConversationsForAffilieAction
// ---------------------------------------------------------------------------

interface AffilieConversationListItem {
  id: string;
  subject: string | null;
  last_message_at: string;
  archived_at: string | null;
  last_message_preview: string | null;
  last_message_sender_name: string | null;
  unread_count: number;
}

export async function listMyConversationsForAffilieAction(
  locale: 'fr' | 'en' = 'fr',
): Promise<AffilieConversationListItem[]> {
  const { affiliateId } = await requireAffilieSession(locale);
  const supabase = getSupabaseServiceClient();

  // 1. Conversations de cet affilie (type=staff_affilie + metadata.affiliate_id).
  const { data: convs } = await supabase
    .from('internal_conversations')
    .select('id, subject, last_message_at, archived_at, metadata')
    .eq('type', 'staff_affilie')
    .eq('metadata->>affiliate_id', affiliateId)
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (!convs || convs.length === 0) return [];

  const ids = convs.map((c) => c.id);

  // 2. Derniers messages par conversation.
  const { data: lastMsgs } = await supabase
    .from('internal_messages')
    .select('conversation_id, body, sender_type, sender_id, created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false });

  const lastMsgByConv = new Map<
    string,
    { body: string; sender_type: string; sender_id: string; created_at: string }
  >();
  for (const m of lastMsgs ?? []) {
    if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m);
  }

  // 3. last_read_at de l affilie pour unread count.
  const { data: viewerParts } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .in('conversation_id', ids)
    .eq('participant_type', 'affiliate')
    .eq('participant_id', affiliateId);
  const lastReadByConv = new Map<string, string | null>();
  for (const vp of viewerParts ?? []) {
    lastReadByConv.set(vp.conversation_id, vp.last_read_at);
  }

  // 4. Unread count par conv.
  const result: AffilieConversationListItem[] = [];
  for (const c of convs) {
    const lastMsg = lastMsgByConv.get(c.id);
    const lastRead = lastReadByConv.get(c.id) ?? null;
    let unreadCount = 0;
    if (lastMsg) {
      const { count } = await supabase
        .from('internal_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .gt('created_at', lastRead ?? '1970-01-01')
        .neq('sender_id', affiliateId);
      unreadCount = count ?? 0;
    }
    let lastMsgSenderName: string | null = null;
    if (lastMsg) {
      if (lastMsg.sender_type === 'user') {
        const { data: u } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', lastMsg.sender_id)
          .maybeSingle();
        lastMsgSenderName = u?.full_name?.trim() || u?.email || null;
      } else if (lastMsg.sender_type === 'affiliate') {
        lastMsgSenderName = 'Vous';
      }
    }
    result.push({
      id: c.id,
      subject: c.subject,
      last_message_at: c.last_message_at,
      archived_at: c.archived_at,
      last_message_preview: lastMsg
        ? lastMsg.body.length > 200
          ? `${lastMsg.body.slice(0, 197)}…`
          : lastMsg.body
        : null,
      last_message_sender_name: lastMsgSenderName,
      unread_count: unreadCount,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// startConversationFromAffilieAction
// ---------------------------------------------------------------------------

const startSchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  subject: z.string().trim().min(1).max(200),
  initial_message: z.string().trim().min(1).max(5000),
});

export async function startConversationFromAffilieAction(
  input: z.input<typeof startSchema>,
): Promise<ActionResult<{ conversation_id: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }
  const { affiliateId } = await requireAffilieSession(parsed.data.locale);
  const supabase = getSupabaseServiceClient();

  // 1. Fetch affilie info pour metadata + notif.
  const { data: aff } = await supabase
    .from('affiliates')
    .select('id, display_name, contact_email, contact_first_name, contact_last_name')
    .eq('id', affiliateId)
    .maybeSingle();
  if (!aff) return { ok: false, error: 'Affilie introuvable.' };

  // 2. Create conversation type=staff_affilie + metadata.
  const { data: conv, error: convErr } = await supabase
    .from('internal_conversations')
    .insert({
      type: 'staff_affilie',
      subject: parsed.data.subject,
      created_by_type: 'affiliate',
      created_by_id: affiliateId,
      metadata: {
        affiliate_id: affiliateId,
        affiliate_name: aff.display_name,
        affiliate_email: aff.contact_email,
      },
    } as never)
    .select('id')
    .single();
  if (convErr || !conv) {
    return { ok: false, error: `Insert conversation: ${convErr?.message ?? 'unknown'}` };
  }
  const conversationId = conv.id;

  // 3. Participants : affilie + staff_pool.
  const { error: partErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: conversationId, participant_type: 'affiliate', participant_id: affiliateId },
    { conversation_id: conversationId, participant_type: 'staff_pool', participant_id: null },
  ]);
  if (partErr) {
    return { ok: false, error: `Insert participants: ${partErr.message}` };
  }

  // 4. Insert premier message.
  const { error: msgErr } = await supabase.from('internal_messages').insert({
    conversation_id: conversationId,
    sender_type: 'affiliate',
    sender_id: affiliateId,
    body: parsed.data.initial_message,
  });
  if (msgErr) {
    return { ok: false, error: `Insert message: ${msgErr.message}` };
  }

  // 5. Notif Resend aux admins staff_pool (best-effort).
  void notifyStaffOfAffilieMessage({
    conversationId,
    subject: parsed.data.subject,
    body: parsed.data.initial_message,
    senderName: aff.display_name,
  }).catch((err) => {
    console.warn('%s notify-staff-failed conv=%s msg=%s', LOG_PREFIX, conversationId, err);
  });

  revalidatePath('/admin/messages');
  return { ok: true, data: { conversation_id: conversationId } };
}

// ---------------------------------------------------------------------------
// replyAsAffilieAction
// ---------------------------------------------------------------------------

const replySchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  conversation_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export async function replyAsAffilieAction(
  input: z.input<typeof replySchema>,
): Promise<ActionResult<{ message_id: string }>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };
  }
  const { affiliateId } = await requireAffilieSession(parsed.data.locale);
  const supabase = getSupabaseServiceClient();

  // Verifier que l affilie est bien participant ET createur via metadata
  // (defense in depth contre tentative d'acces a une autre conv).
  const { data: conv } = await supabase
    .from('internal_conversations')
    .select('id, subject, metadata')
    .eq('id', parsed.data.conversation_id)
    .eq('type', 'staff_affilie')
    .eq('metadata->>affiliate_id', affiliateId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'Conversation introuvable ou acces refuse.' };

  const { data: msg, error: msgErr } = await supabase
    .from('internal_messages')
    .insert({
      conversation_id: parsed.data.conversation_id,
      sender_type: 'affiliate',
      sender_id: affiliateId,
      body: parsed.data.body,
    })
    .select('id')
    .single();
  if (msgErr || !msg) {
    return { ok: false, error: `Insert message: ${msgErr?.message ?? 'unknown'}` };
  }

  // Update last_read_at de l affilie (il vient d'envoyer).
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq('conversation_id', parsed.data.conversation_id)
    .eq('participant_type', 'affiliate')
    .eq('participant_id', affiliateId);

  // Notif staff (best-effort).
  const { data: aff } = await supabase
    .from('affiliates')
    .select('display_name')
    .eq('id', affiliateId)
    .maybeSingle();
  void notifyStaffOfAffilieMessage({
    conversationId: parsed.data.conversation_id,
    subject: conv.subject ?? 'Conversation affilié',
    body: parsed.data.body,
    senderName: aff?.display_name ?? 'Affilié',
  }).catch((err) => {
    console.warn('%s notify-staff-failed msg=%s', LOG_PREFIX, err);
  });

  revalidatePath('/admin/messages');
  return { ok: true, data: { message_id: msg.id } };
}

// ---------------------------------------------------------------------------
// getConversationDetailForAffilieAction
// ---------------------------------------------------------------------------

interface AffilieConversationDetail {
  id: string;
  subject: string | null;
  created_at: string;
  messages: Array<{
    id: string;
    body: string;
    sender_type: 'user' | 'contact' | 'affiliate';
    sender_id: string;
    sender_name: string;
    created_at: string;
    is_mine: boolean;
  }>;
}

export async function getConversationDetailForAffilieAction(
  conversationId: string,
  locale: 'fr' | 'en' = 'fr',
): Promise<ActionResult<AffilieConversationDetail>> {
  const { affiliateId } = await requireAffilieSession(locale);
  const supabase = getSupabaseServiceClient();

  const { data: conv } = await supabase
    .from('internal_conversations')
    .select('id, subject, created_at, metadata')
    .eq('id', conversationId)
    .eq('type', 'staff_affilie')
    .eq('metadata->>affiliate_id', affiliateId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'Conversation introuvable ou acces refuse.' };

  const { data: msgs } = await supabase
    .from('internal_messages')
    .select('id, body, sender_type, sender_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const userSenderIds = (msgs ?? [])
    .filter((m) => m.sender_type === 'user')
    .map((m) => m.sender_id);
  const userMap = new Map<string, string>();
  if (userSenderIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', userSenderIds);
    for (const u of users ?? []) {
      userMap.set(u.id, u.full_name?.trim() || u.email);
    }
  }

  // Marque comme lu (last_read_at = now).
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() } as never)
    .eq('conversation_id', conversationId)
    .eq('participant_type', 'affiliate')
    .eq('participant_id', affiliateId);

  return {
    ok: true,
    data: {
      id: conv.id,
      subject: conv.subject,
      created_at: conv.created_at,
      messages: (msgs ?? []).map((m) => ({
        id: m.id,
        body: m.body,
        sender_type: m.sender_type as 'user' | 'contact' | 'affiliate',
        sender_id: m.sender_id,
        sender_name:
          m.sender_type === 'user'
            ? (userMap.get(m.sender_id) ?? 'Equipe MDS')
            : m.sender_type === 'affiliate'
              ? 'Vous'
              : 'Contact',
        created_at: m.created_at,
        is_mine: m.sender_type === 'affiliate' && m.sender_id === affiliateId,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers notification email (best-effort)
// ---------------------------------------------------------------------------

async function notifyStaffOfAffilieMessage(args: {
  conversationId: string;
  subject: string;
  body: string;
  senderName: string;
}): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'admin_notification_emails')
    .maybeSingle();
  const value = data?.value;
  if (!Array.isArray(value)) return;
  const admins = (value as unknown[])
    .filter((v): v is string => typeof v === 'string' && v.includes('@'))
    .map((email) => ({ email, name: 'Admin MDS' }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const url = `${appUrl}/admin/messages/conversations/${args.conversationId}`;
  const preview = args.body.length > 200 ? `${args.body.slice(0, 197)}…` : args.body;

  for (const a of admins) {
    try {
      const tpl = renderInternalMessageNotification({
        recipientName: a.name,
        senderName: args.senderName,
        conversationSubject: args.subject,
        messagePreview: preview,
        conversationUrl: url,
        locale: 'fr',
      });
      await sendTransactionalEmailViaResend({
        to: a.email,
        toName: a.name,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        replyTo: 'philippe@mediadays.solutions',
        tags: [{ name: 'category', value: 'affilie_message' }],
      });
    } catch (err) {
      console.warn('%s admin-notif-failed to=%s msg=%s', LOG_PREFIX, a.email, err);
    }
  }
}
