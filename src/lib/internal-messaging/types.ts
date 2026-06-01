/**
 * P9.2 — types partages pour la messagerie interne.
 * Sans 'use server' pour permettre l'import depuis client + server.
 */

export type ConversationType = 'staff_dm' | 'support' | 'staff_broadcast';
export type ConversationPriority = 'low' | 'normal' | 'high';
export type ParticipantType = 'user' | 'contact' | 'staff_pool';
export type SenderType = 'user' | 'contact';

export interface ConversationParticipant {
  id: string;
  participant_type: ParticipantType;
  participant_id: string | null;
  last_read_at: string | null;
  /** Display info (jointe pour l'UI ; null pour staff_pool). */
  display_name: string | null;
  display_email: string | null;
}

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  subject: string | null;
  priority: ConversationPriority;
  created_at: string;
  last_message_at: string;
  archived_at: string | null;
  /** Le "titre" de la conversation cote UI (autre participant ou subject). */
  display_title: string;
  /** Extrait du dernier message (truncate 200). */
  last_message_preview: string | null;
  last_message_sender_name: string | null;
  /** Nombre de messages non-lus pour le viewer courant. */
  unread_count: number;
  /** Le viewer est-il participant pool (staff support) ou direct ? */
  participants: ConversationParticipant[];
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string;
  sender_name: string;
  sender_email: string | null;
  body: string;
  created_at: string;
}

export interface ConversationDetail {
  conversation: ConversationListItem;
  messages: ConversationMessage[];
}

export type CreateConversationResult =
  | { ok: true; conversation_id: string }
  | { ok: false; error: string };

export type SendMessageResult = { ok: true; message_id: string } | { ok: false; error: string };
