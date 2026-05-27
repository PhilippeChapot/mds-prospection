'use server';

/**
 * P9.2 — server actions messagerie interne asynchrone.
 *
 * Permet 2 types de conversations :
 *   - staff_dm   : DM prive staff↔staff (2 user participants).
 *   - support    : staff↔contact (1 contact + staff_pool sentinelle =
 *                  inbox partagee staff).
 *
 * Decision Cowork 2026-05-27 : pas de temps reel (Supabase Realtime
 * abandonne) ; chaque message declenche une notif email Resend aux
 * autres participants (admin_notification_emails pour staff_pool).
 *
 * Polymorphisme :
 *   - viewer staff : authentifie via requireAdminProfile() (Supabase auth).
 *   - viewer contact : authentifie via requireEspaceExposantSession()
 *     (JWT cookie espace-exposant) -> resoudre l'id contact via
 *     prospects.primary_contact_id.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { requireEspaceExposantSession } from '@/lib/espace-exposant/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { renderInternalMessageNotification } from '@/lib/resend/templates/internal-message-notification';
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  ConversationParticipant,
  ConversationType,
  CreateConversationResult,
  ParticipantType,
  SendMessageResult,
  SenderType,
} from './types';

const LOG_PREFIX = '[internal-messaging]';

// ---------------------------------------------------------------------------
// Viewer resolution
// ---------------------------------------------------------------------------

type Viewer =
  | { kind: 'user'; id: string; full_name: string | null; email: string }
  | { kind: 'contact'; id: string; full_name: string; email: string };

async function resolveStaffViewer(): Promise<Viewer> {
  const profile = await requireAdminProfile();
  return {
    kind: 'user',
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
  };
}

async function resolveContactViewer(locale: string): Promise<Viewer> {
  const { prospectId } = await requireEspaceExposantSession(locale);
  const supabase = getSupabaseServiceClient();
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select(
      'primary_contact_id, contact:contacts!primary_contact_id(id, email, first_name, last_name)',
    )
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !prospect?.primary_contact_id) {
    throw new Error(
      'Impossible de retrouver votre contact dans la base. Reconnectez-vous depuis votre lien magique.',
    );
  }
  type ContactRel = {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  const c: ContactRel | null = Array.isArray(prospect.contact)
    ? ((prospect.contact[0] as ContactRel | undefined) ?? null)
    : (prospect.contact as unknown as ContactRel | null);
  if (!c) {
    throw new Error('Contact non trouve.');
  }
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email;
  return { kind: 'contact', id: c.id, full_name: fullName, email: c.email };
}

// ---------------------------------------------------------------------------
// Helpers DB
// ---------------------------------------------------------------------------

async function isViewerParticipant(
  conversationId: string,
  viewer: Viewer,
): Promise<{ participant: ConversationParticipantRow | null; isStaffPool: boolean }> {
  const supabase = getSupabaseServiceClient();
  // Staff : autorise via staff_pool OU participant user direct.
  const { data } = await supabase
    .from('conversation_participants')
    .select('id, participant_type, participant_id, last_read_at')
    .eq('conversation_id', conversationId);
  if (!data) return { participant: null, isStaffPool: false };
  if (viewer.kind === 'user') {
    const direct = data.find(
      (p) => p.participant_type === 'user' && p.participant_id === viewer.id,
    );
    const pool = data.find((p) => p.participant_type === 'staff_pool');
    return { participant: direct ?? pool ?? null, isStaffPool: !!pool && !direct };
  }
  // contact
  const direct = data.find(
    (p) => p.participant_type === 'contact' && p.participant_id === viewer.id,
  );
  return { participant: direct ?? null, isStaffPool: false };
}

interface ConversationParticipantRow {
  id: string;
  participant_type: string;
  participant_id: string | null;
  last_read_at: string | null;
}

interface AdminRecipient {
  email: string;
  name: string;
}

async function loadStaffPoolRecipients(): Promise<AdminRecipient[]> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'admin_notification_emails')
    .maybeSingle();
  const value = data?.value;
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((v): v is string => typeof v === 'string' && v.includes('@'))
    .map((email) => ({ email, name: 'Admin MDS' }));
}

// ---------------------------------------------------------------------------
// createConversationAction (staff OU contact)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  /** Si `as_contact=true`, on resout le viewer comme contact via espace-exposant. */
  as_contact: z.boolean().default(false),
  locale: z.enum(['fr', 'en']).default('fr'),
  type: z.enum(['staff_dm', 'support']),
  recipient_type: z.enum(['user', 'contact', 'staff_pool']),
  recipient_id: z.string().uuid().nullable().optional(),
  subject: z.string().trim().max(200).optional(),
  initial_message: z.string().trim().min(1).max(5000),
});

export async function createConversationAction(
  input: z.input<typeof createSchema>,
): Promise<CreateConversationResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  let viewer: Viewer;
  try {
    viewer = data.as_contact ? await resolveContactViewer(data.locale) : await resolveStaffViewer();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
  }

  // Regles de creation :
  //   staff initie : staff_dm vers user OU support vers contact.
  //   contact initie : support uniquement vers staff_pool (un contact ne
  //     peut PAS ecrire a un autre contact).
  if (viewer.kind === 'contact') {
    if (data.type !== 'support' || data.recipient_type !== 'staff_pool') {
      return {
        ok: false,
        error: "Vous ne pouvez contacter que l'équipe MDS (pas un autre exposant).",
      };
    }
  } else {
    // viewer staff
    if (data.type === 'staff_dm' && data.recipient_type !== 'user') {
      return { ok: false, error: 'Un DM doit cibler un user staff.' };
    }
    if (data.type === 'support' && data.recipient_type !== 'contact') {
      return { ok: false, error: 'Une conversation support doit cibler un contact.' };
    }
    if (!data.recipient_id) {
      return { ok: false, error: 'recipient_id manquant.' };
    }
  }

  const supabase = getSupabaseServiceClient();

  // 1. Create conversation.
  const { data: conv, error: convErr } = await supabase
    .from('internal_conversations')
    .insert({
      type: data.type,
      subject: data.subject ?? null,
      created_by_type: viewer.kind,
      created_by_id: viewer.id,
    })
    .select('id')
    .single();
  if (convErr || !conv) {
    return { ok: false, error: `Insert conversation failed: ${convErr?.message ?? 'unknown'}` };
  }
  const conversationId = conv.id;

  // 2. Participants : initiateur + destinataire(s).
  const participants: Array<{
    participant_type: ParticipantType;
    participant_id: string | null;
  }> = [{ participant_type: viewer.kind, participant_id: viewer.id }];

  if (viewer.kind === 'contact') {
    participants.push({ participant_type: 'staff_pool', participant_id: null });
  } else {
    participants.push({
      participant_type: data.recipient_type,
      participant_id: data.recipient_id ?? null,
    });
  }

  const { error: partErr } = await supabase.from('conversation_participants').insert(
    participants.map((p) => ({
      conversation_id: conversationId,
      participant_type: p.participant_type,
      participant_id: p.participant_id,
    })),
  );
  if (partErr) {
    return { ok: false, error: `Insert participants failed: ${partErr.message}` };
  }

  // 3. Premier message + notif email (delegue a sendMessage interne pour
  //    centraliser la logique).
  const sendResult = await sendMessageInternal(conversationId, viewer, data.initial_message);
  if (!sendResult.ok) return sendResult;

  revalidatePath('/admin/messages');
  return { ok: true, conversation_id: conversationId };
}

// ---------------------------------------------------------------------------
// sendMessageAction
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  as_contact: z.boolean().default(false),
  locale: z.enum(['fr', 'en']).default('fr'),
  conversation_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export async function sendMessageAction(
  input: z.input<typeof sendSchema>,
): Promise<SendMessageResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  let viewer: Viewer;
  try {
    viewer = data.as_contact ? await resolveContactViewer(data.locale) : await resolveStaffViewer();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Non authentifie' };
  }

  // Verifier que l'expediteur est participant.
  const { participant } = await isViewerParticipant(data.conversation_id, viewer);
  if (!participant) {
    return { ok: false, error: "Vous n'êtes pas participant de cette conversation." };
  }

  return sendMessageInternal(data.conversation_id, viewer, data.body);
}

// Interne (non exporte) — appele par createConversation et sendMessage.
// Pas un server action en soi mais c'est OK dans un fichier 'use server'
// pour les fonctions async non exportees.
async function sendMessageInternal(
  conversationId: string,
  viewer: Viewer,
  body: string,
): Promise<SendMessageResult> {
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('internal_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: viewer.kind,
      sender_id: viewer.id,
      body,
    })
    .select('id')
    .single();
  if (error || !row) {
    return { ok: false, error: `Insert message failed: ${error?.message ?? 'unknown'}` };
  }

  // Notifs email (best-effort, async, on n'attend pas).
  try {
    await notifyOtherParticipants(conversationId, viewer, body);
  } catch (err) {
    console.warn(
      '%s notify-failed conv=%s msg=%s',
      LOG_PREFIX,
      conversationId,
      err instanceof Error ? err.message : String(err),
    );
  }

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/conversations/${conversationId}`);
  return { ok: true, message_id: row.id };
}

async function notifyOtherParticipants(
  conversationId: string,
  sender: Viewer,
  body: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { data: conv } = await supabase
    .from('internal_conversations')
    .select('id, subject, type')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return;

  const { data: parts } = await supabase
    .from('conversation_participants')
    .select('participant_type, participant_id')
    .eq('conversation_id', conversationId);
  if (!parts) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const messagePreview = body.length > 200 ? `${body.slice(0, 197)}…` : body;
  const senderName = sender.full_name || sender.email;

  const recipients: Array<{
    email: string;
    name: string;
    url: string;
    locale: 'fr' | 'en';
  }> = [];

  for (const p of parts) {
    // Skip l'expediteur.
    if (p.participant_type === sender.kind && p.participant_id === sender.id) continue;

    if (p.participant_type === 'user' && p.participant_id) {
      const { data: u } = await supabase
        .from('users')
        .select('email, full_name, language')
        .eq('id', p.participant_id)
        .maybeSingle();
      if (u?.email) {
        recipients.push({
          email: u.email,
          name: u.full_name?.trim() || u.email,
          url: `${appUrl}/admin/messages/conversations/${conversationId}`,
          locale: (u.language as 'fr' | 'en') === 'en' ? 'en' : 'fr',
        });
      }
    } else if (p.participant_type === 'contact' && p.participant_id) {
      const { data: c } = await supabase
        .from('contacts')
        .select('email, first_name, last_name, language')
        .eq('id', p.participant_id)
        .maybeSingle();
      if (c?.email) {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email;
        recipients.push({
          email: c.email,
          name: fullName,
          url: `${appUrl}/espace-exposant/messages/${conversationId}`,
          locale: (c.language as 'fr' | 'en') === 'en' ? 'en' : 'fr',
        });
      }
    } else if (p.participant_type === 'staff_pool') {
      // Notif admin_notification_emails (1 email par admin).
      const admins = await loadStaffPoolRecipients();
      for (const a of admins) {
        recipients.push({
          email: a.email,
          name: a.name,
          url: `${appUrl}/admin/messages/conversations/${conversationId}`,
          locale: 'fr',
        });
      }
    }
  }

  for (const r of recipients) {
    try {
      const tpl = renderInternalMessageNotification({
        recipientName: r.name,
        senderName,
        conversationSubject: conv.subject,
        messagePreview,
        conversationUrl: r.url,
        locale: r.locale,
      });
      await sendTransactionalEmailViaResend({
        to: r.email,
        toName: r.name,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        replyTo: 'philippe@mediadays.solutions',
        tags: [{ name: 'category', value: 'internal_message' }],
      });
    } catch (err) {
      console.warn(
        '%s recipient-notif-failed to=%s msg=%s',
        LOG_PREFIX,
        r.email,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// listMyConversationsAction
// ---------------------------------------------------------------------------

export async function listMyConversationsAction(input?: {
  as_contact?: boolean;
  locale?: 'fr' | 'en';
}): Promise<ConversationListItem[]> {
  let viewer: Viewer;
  try {
    viewer = input?.as_contact
      ? await resolveContactViewer(input.locale ?? 'fr')
      : await resolveStaffViewer();
  } catch {
    return [];
  }
  const supabase = getSupabaseServiceClient();

  // Liste des conversation_ids visibles par le viewer :
  //   staff   : tous (RLS deja restrictif via is_admin_or_sales).
  //   contact : ceux ou il est participant.
  let convIds: string[] = [];
  if (viewer.kind === 'contact') {
    const { data } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('participant_type', 'contact')
      .eq('participant_id', viewer.id);
    convIds = (data ?? []).map((r) => r.conversation_id);
    if (convIds.length === 0) return [];
  }

  let query = supabase
    .from('internal_conversations')
    .select('id, type, subject, created_at, last_message_at, archived_at')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (viewer.kind === 'contact') {
    query = query.in('id', convIds);
  }
  const { data: convs } = await query;
  if (!convs || convs.length === 0) return [];

  // Pour chaque conversation : participants + dernier message + unread count.
  const ids = convs.map((c) => c.id);

  const [{ data: allParts }, { data: lastMsgs }, { data: viewerParts }] = await Promise.all([
    supabase
      .from('conversation_participants')
      .select('conversation_id, id, participant_type, participant_id, last_read_at')
      .in('conversation_id', ids),
    supabase
      .from('internal_messages')
      .select('conversation_id, id, body, sender_type, sender_id, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false }),
    // Recharger uniquement les participants ou le viewer est lui-meme,
    // pour le compteur unread (utilise last_read_at).
    viewer.kind === 'contact'
      ? supabase
          .from('conversation_participants')
          .select('conversation_id, last_read_at')
          .in('conversation_id', ids)
          .eq('participant_type', 'contact')
          .eq('participant_id', viewer.id)
      : supabase
          .from('conversation_participants')
          .select('conversation_id, last_read_at')
          .in('conversation_id', ids)
          .or(
            `and(participant_type.eq.user,participant_id.eq.${viewer.id}),participant_type.eq.staff_pool`,
          ),
  ]);

  const partsByConv = new Map<string, ConversationParticipantRow[]>();
  for (const p of allParts ?? []) {
    const arr = partsByConv.get(p.conversation_id) ?? [];
    arr.push(p as ConversationParticipantRow);
    partsByConv.set(p.conversation_id, arr);
  }

  // dernier message par conversation = la 1ere row apres le tri DESC.
  const lastMsgByConv = new Map<
    string,
    { id: string; body: string; sender_type: string; sender_id: string; created_at: string }
  >();
  for (const m of lastMsgs ?? []) {
    if (!lastMsgByConv.has(m.conversation_id)) {
      lastMsgByConv.set(m.conversation_id, m);
    }
  }

  const viewerLastReadByConv = new Map<string, string | null>();
  for (const vp of viewerParts ?? []) {
    // Si plusieurs lignes (cas staff user + staff_pool), on prend le max
    // (la plus recente lecture).
    const prev = viewerLastReadByConv.get(vp.conversation_id);
    const next = vp.last_read_at;
    if (!prev) viewerLastReadByConv.set(vp.conversation_id, next);
    else if (next && new Date(next) > new Date(prev)) {
      viewerLastReadByConv.set(vp.conversation_id, next);
    }
  }

  // Pour chaque conversation, compter les messages plus recents que
  // last_read_at, qui ne sont pas du viewer lui-meme.
  const result: ConversationListItem[] = [];
  for (const c of convs) {
    const parts = partsByConv.get(c.id) ?? [];
    const lastRead = viewerLastReadByConv.get(c.id) ?? null;

    // Display title : pour staff_dm, le nom du "autre" participant user.
    // Pour support, le contact (si viewer = staff) ou "Équipe MDS" (si viewer = contact).
    const displayTitle = await deriveDisplayTitle(
      c.type as ConversationType,
      parts,
      viewer,
      supabase,
    );

    // Unread count.
    const { count: unreadCount } = await supabase
      .from('internal_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id)
      .gt('created_at', lastRead ?? '1970-01-01T00:00:00Z')
      .or(`sender_type.neq.${viewer.kind},sender_id.neq.${viewer.id}`);

    const lastMsg = lastMsgByConv.get(c.id) ?? null;
    let lastMsgSenderName: string | null = null;
    if (lastMsg) {
      if (lastMsg.sender_type === 'user') {
        const { data: u } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', lastMsg.sender_id)
          .maybeSingle();
        lastMsgSenderName = u?.full_name?.trim() || u?.email || null;
      } else {
        const { data: ct } = await supabase
          .from('contacts')
          .select('first_name, last_name, email')
          .eq('id', lastMsg.sender_id)
          .maybeSingle();
        lastMsgSenderName = ct
          ? [ct.first_name, ct.last_name].filter(Boolean).join(' ').trim() || ct.email
          : null;
      }
    }

    result.push({
      id: c.id,
      type: c.type as ConversationType,
      subject: c.subject,
      created_at: c.created_at,
      last_message_at: c.last_message_at,
      archived_at: c.archived_at,
      display_title: displayTitle,
      last_message_preview: lastMsg
        ? lastMsg.body.length > 200
          ? `${lastMsg.body.slice(0, 197)}…`
          : lastMsg.body
        : null,
      last_message_sender_name: lastMsgSenderName,
      unread_count: unreadCount ?? 0,
      participants: parts.map((p) => ({
        id: p.id,
        participant_type: p.participant_type as ParticipantType,
        participant_id: p.participant_id,
        last_read_at: p.last_read_at,
        display_name: null,
        display_email: null,
      })),
    });
  }

  return result;
}

async function deriveDisplayTitle(
  type: ConversationType,
  parts: ConversationParticipantRow[],
  viewer: Viewer,
  supabase: ReturnType<typeof getSupabaseServiceClient>,
): Promise<string> {
  // staff_dm : nom du user qui n'est pas le viewer.
  if (type === 'staff_dm') {
    const other = parts.find(
      (p) =>
        p.participant_type === 'user' &&
        !(viewer.kind === 'user' && p.participant_id === viewer.id),
    );
    if (other?.participant_id) {
      const { data: u } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', other.participant_id)
        .maybeSingle();
      return u?.full_name?.trim() || u?.email || 'Collaborateur';
    }
    return 'DM staff';
  }
  // support : viewer staff -> nom du contact ; viewer contact -> "Équipe MDS".
  if (viewer.kind === 'contact') return 'Équipe MediaDays Solutions';
  const contactPart = parts.find((p) => p.participant_type === 'contact');
  if (contactPart?.participant_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', contactPart.participant_id)
      .maybeSingle();
    if (c) {
      return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || 'Contact';
    }
  }
  return 'Conversation support';
}

// ---------------------------------------------------------------------------
// getConversationAction
// ---------------------------------------------------------------------------

export async function getConversationAction(input: {
  conversation_id: string;
  as_contact?: boolean;
  locale?: 'fr' | 'en';
}): Promise<ConversationDetail | null> {
  let viewer: Viewer;
  try {
    viewer = input.as_contact
      ? await resolveContactViewer(input.locale ?? 'fr')
      : await resolveStaffViewer();
  } catch {
    return null;
  }
  const supabase = getSupabaseServiceClient();

  const { participant } = await isViewerParticipant(input.conversation_id, viewer);
  if (!participant) return null;

  const { data: conv } = await supabase
    .from('internal_conversations')
    .select('id, type, subject, created_at, last_message_at, archived_at')
    .eq('id', input.conversation_id)
    .maybeSingle();
  if (!conv) return null;

  const { data: parts } = await supabase
    .from('conversation_participants')
    .select('id, participant_type, participant_id, last_read_at')
    .eq('conversation_id', input.conversation_id);

  const { data: messagesRaw } = await supabase
    .from('internal_messages')
    .select('id, conversation_id, sender_type, sender_id, body, created_at')
    .eq('conversation_id', input.conversation_id)
    .order('created_at', { ascending: true });

  // Hydrate sender_name pour chaque message (1 query par type).
  const userSenderIds = new Set<string>();
  const contactSenderIds = new Set<string>();
  for (const m of messagesRaw ?? []) {
    if (m.sender_type === 'user') userSenderIds.add(m.sender_id);
    else if (m.sender_type === 'contact') contactSenderIds.add(m.sender_id);
  }

  const [usersRes, contactsRes] = await Promise.all([
    userSenderIds.size > 0
      ? supabase.from('users').select('id, full_name, email').in('id', Array.from(userSenderIds))
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null; email: string }>,
        }),
    contactSenderIds.size > 0
      ? supabase
          .from('contacts')
          .select('id, first_name, last_name, email')
          .in('id', Array.from(contactSenderIds))
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string;
          }>,
        }),
  ]);

  const userById = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
  const contactById = new Map((contactsRes.data ?? []).map((c) => [c.id, c]));

  const messages: ConversationMessage[] = (messagesRaw ?? []).map((m) => {
    let senderName = '—';
    let senderEmail: string | null = null;
    if (m.sender_type === 'user') {
      const u = userById.get(m.sender_id);
      senderName = u?.full_name?.trim() || u?.email || 'Staff';
      senderEmail = u?.email ?? null;
    } else {
      const c = contactById.get(m.sender_id);
      senderName = c
        ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email
        : 'Visiteur';
      senderEmail = c?.email ?? null;
    }
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_type: m.sender_type as SenderType,
      sender_id: m.sender_id,
      sender_name: senderName,
      sender_email: senderEmail,
      body: m.body,
      created_at: m.created_at,
    };
  });

  // Auto-update last_read_at sur le participant du viewer.
  const now = new Date().toISOString();
  if (viewer.kind === 'user') {
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: now })
      .eq('conversation_id', input.conversation_id)
      .or(
        `and(participant_type.eq.user,participant_id.eq.${viewer.id}),participant_type.eq.staff_pool`,
      );
  } else {
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: now })
      .eq('conversation_id', input.conversation_id)
      .eq('participant_type', 'contact')
      .eq('participant_id', viewer.id);
  }

  const displayTitle = await deriveDisplayTitle(
    conv.type as ConversationType,
    (parts ?? []) as ConversationParticipantRow[],
    viewer,
    supabase,
  );

  return {
    conversation: {
      id: conv.id,
      type: conv.type as ConversationType,
      subject: conv.subject,
      created_at: conv.created_at,
      last_message_at: conv.last_message_at,
      archived_at: conv.archived_at,
      display_title: displayTitle,
      last_message_preview: null,
      last_message_sender_name: null,
      unread_count: 0,
      participants: (parts ?? []).map((p) => ({
        id: p.id,
        participant_type: p.participant_type as ParticipantType,
        participant_id: p.participant_id,
        last_read_at: p.last_read_at,
        display_name: null,
        display_email: null,
      })),
    },
    messages,
  };
}

// ---------------------------------------------------------------------------
// listStaffForNewConversationAction (admin) — selecteur DM
// ---------------------------------------------------------------------------

export async function listStaffForNewConversationAction(): Promise<
  Array<{ id: string; full_name: string | null; email: string; role: string }>
> {
  const me = await requireAdminProfile();
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'sales', 'super_admin'])
    .neq('id', me.id)
    .order('full_name', { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  }>;
}

// ---------------------------------------------------------------------------
// searchContactsForNewConversationAction (admin)
// ---------------------------------------------------------------------------

export async function searchContactsForNewConversationAction(input: {
  query: string;
}): Promise<Array<{ id: string; email: string; full_name: string; company_name: string | null }>> {
  await requireAdminProfile();
  const q = input.query?.trim();
  if (!q || q.length < 2) return [];
  const supabase = getSupabaseServiceClient();
  const term = `%${q}%`;
  const { data } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company:companies(name)')
    .or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`)
    .limit(20);
  return (data ?? []).map((c) => {
    const company = Array.isArray(c.company)
      ? c.company[0]
      : (c.company as { name?: string } | null);
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email;
    return {
      id: c.id as string,
      email: c.email as string,
      full_name: fullName,
      company_name: (company as { name?: string } | null)?.name ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// countUnreadConversationsAction
// ---------------------------------------------------------------------------

export async function countUnreadConversationsAction(input?: {
  as_contact?: boolean;
  locale?: 'fr' | 'en';
}): Promise<number> {
  let viewer: Viewer;
  try {
    viewer = input?.as_contact
      ? await resolveContactViewer(input.locale ?? 'fr')
      : await resolveStaffViewer();
  } catch {
    return 0;
  }
  const supabase = getSupabaseServiceClient();

  // Pour le viewer staff : on prend toutes les conversations support
  // (staff_pool) + ses DM. Pour le contact : ses conversations.
  let participantQuery = supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at');
  if (viewer.kind === 'contact') {
    participantQuery = participantQuery
      .eq('participant_type', 'contact')
      .eq('participant_id', viewer.id);
  } else {
    participantQuery = participantQuery.or(
      `and(participant_type.eq.user,participant_id.eq.${viewer.id}),participant_type.eq.staff_pool`,
    );
  }
  const { data: parts } = await participantQuery;
  if (!parts || parts.length === 0) return 0;

  let unread = 0;
  for (const p of parts) {
    const { count } = await supabase
      .from('internal_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', p.conversation_id)
      .gt('created_at', p.last_read_at ?? '1970-01-01T00:00:00Z')
      .or(`sender_type.neq.${viewer.kind},sender_id.neq.${viewer.id}`);
    if ((count ?? 0) > 0) unread++;
  }
  return unread;
}
