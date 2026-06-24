/**
 * P12.x.EmailIntegration — types partagés (pas de 'use server').
 */

export interface EmailAccountRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  env_var_key: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  is_active: boolean;
  last_uid: number | null;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface ResolvedAccountConfig {
  account: EmailAccountRow;
  imapPassword: string;
  smtpPassword: string;
}

export type EmailDirection = 'inbound' | 'outbound';

export interface SyncResult {
  accountId: string;
  email: string;
  ok: boolean;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  error?: string;
}
