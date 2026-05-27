/**
 * P9.1-natif — types partages entre server actions et UI (importables
 * depuis client + server). Fichier sans 'use server' = OK pour les
 * client components.
 */

export type VisitorMessageStatus = 'new' | 'read' | 'replied' | 'archived';
export type VisitorMessageLocale = 'fr' | 'en';

export interface VisitorMessageRow {
  id: string;
  /** P9.1-natif-bis : prenom (separe de last_name). Null pour les rows
   *  pre-pivot (rares). */
  visitor_first_name: string | null;
  /** P9.1-natif-bis : nom de famille (ex `visitor_name`). */
  visitor_last_name: string;
  visitor_email: string;
  visitor_phone: string | null;
  /** P9.1-natif-bis : societe (requis cote widget). */
  visitor_company: string | null;
  /** P9.1-natif-bis : URL site societe (optionnel). */
  visitor_company_url: string | null;
  message: string;
  page_url: string | null;
  locale: VisitorMessageLocale;
  prospect_id: string | null;
  status: VisitorMessageStatus;
  assigned_to_user_id: string | null;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
}

export interface VisitorMessageReplyRow {
  id: string;
  visitor_message_id: string;
  sender_user_id: string;
  sender_full_name: string | null;
  sender_email: string | null;
  reply_text: string;
  email_sent_at: string | null;
  email_resend_id: string | null;
  created_at: string;
}

export interface VisitorMessageWithMeta extends VisitorMessageRow {
  prospect_company_name: string | null;
  assigned_to_full_name: string | null;
}

export interface ListVisitorMessagesInput {
  status?: VisitorMessageStatus | 'all';
  search?: string;
  page?: number;
}

export type SubmitVisitorMessageResult =
  | { ok: true; message_id: string }
  | { ok: false; error: string; code?: 'invalid' | 'rate_limit' };

export type ReplyResult =
  | { ok: true; reply_id: string; email_sent: boolean }
  | { ok: false; error: string };
