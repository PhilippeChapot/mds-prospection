/**
 * P14.2.SalesCalendarGoogleSync — accès typé à calendar_oauth_tokens.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module
 * (pas de 'use server'). Importable depuis server actions, routes, crons.
 *
 * La table calendar_oauth_tokens (migration 0090) n'est pas encore dans
 * database.types.ts (Phil applique via pnpm db:push après commit, doctrine
 * [[feedback_supabase_mcp_migration_drift]]). On caste donc le client en
 * untyped pour cette table — même escape hatch que timeline-helpers.ts.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export interface OAuthTokenRow {
  user_id: string;
  provider: 'google';
  encrypted_refresh_token: string;
  google_account_email: string | null;
  google_calendar_id: string;
  sync_enabled: boolean;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_token: string | null;
  webhook_expires_at: string | null;
  webhook_last_renewed_at: string | null;
  sync_token: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = 'calendar_oauth_tokens';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return getSupabaseServiceClient();
}

/** Lit la connexion Google d'un user (null si non connecté). */
export async function getOAuthToken(userId: string): Promise<OAuthTokenRow | null> {
  const { data, error } = await db().from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    console.warn('[google/tokens-store] get-failed user=%s msg=%s', userId, error.message);
    return null;
  }
  return (data as OAuthTokenRow | null) ?? null;
}

/** Lit la connexion liée à un webhook channel (résolution PULL). */
export async function getOAuthTokenByChannel(channelId: string): Promise<OAuthTokenRow | null> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('webhook_channel_id', channelId)
    .maybeSingle();
  return (data as OAuthTokenRow | null) ?? null;
}

/** Crée ou remplace la connexion d'un user (à la fin du flow OAuth). */
export async function upsertOAuthToken(
  row: Pick<OAuthTokenRow, 'user_id' | 'encrypted_refresh_token'> & Partial<OAuthTokenRow>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = {
    provider: 'google' as const,
    google_calendar_id: 'primary',
    sync_enabled: true,
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from(TABLE).upsert(payload, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Met à jour des champs partiels (webhook, sync_token, calendrier, etc.). */
export async function updateOAuthToken(
  userId: string,
  patch: Partial<OAuthTokenRow>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Supprime la connexion (déconnexion). */
export async function deleteOAuthToken(userId: string): Promise<void> {
  await db().from(TABLE).delete().eq('user_id', userId);
}

/** Liste les connexions actives dont le webhook expire avant `before` (cron renewal). */
export async function listTokensForWebhookRenewal(beforeIso: string): Promise<OAuthTokenRow[]> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('sync_enabled', true)
    .or(`webhook_expires_at.is.null,webhook_expires_at.lte.${beforeIso}`);
  return (data as OAuthTokenRow[] | null) ?? [];
}
