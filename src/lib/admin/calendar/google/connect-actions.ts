'use server';

/**
 * P14.2.SalesCalendarGoogleSync — server actions OAuth + settings sync.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : exports async
 * uniquement (helpers/types dans les modules ./*.ts voisins).
 *
 * Actions :
 *   - connectGoogleCalendarAction    : retourne l'URL de consentement Google.
 *   - disconnectGoogleCalendarAction : revoke + unregister webhook + cleanup.
 *   - setSyncCalendarAction          : change le calendrier cible + re-watch.
 *   - toggleSyncEnabledAction        : active/coupe la sync (watch on/off).
 *   - listGoogleCalendarsAction      : calendriers de l'user (dropdown).
 *   - getGoogleSyncStatusAction      : état connexion pour la page settings.
 *
 * RBAC : tous rôles admin (chacun connecte SON propre compte Google).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  buildConsentUrl,
  signOAuthState,
  getAuthenticatedClientForUser,
  calendarClient,
  revokeToken,
} from './oauth-client';
import { decryptToken } from './encryption';
import { getOAuthToken, updateOAuthToken, deleteOAuthToken } from './tokens-store';
import { registerWebhook, unregisterWebhook } from './webhook-manager';

export type GoogleSyncResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

// ─── Connect : génère l'URL de consentement ────────────────────────────
export async function connectGoogleCalendarAction(): Promise<GoogleSyncResult<{ url: string }>> {
  const profile = await requireAdminProfile();
  try {
    // Date.now() autorisé en server action (pas de purity react).
    const state = signOAuthState(profile.id, Date.now());
    const url = buildConsentUrl(state);
    return { ok: true, data: { url } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Config OAuth manquante.' };
  }
}

// ─── Disconnect : revoke + cleanup ──────────────────────────────────────
export async function disconnectGoogleCalendarAction(): Promise<GoogleSyncResult<{ done: true }>> {
  const profile = await requireAdminProfile();
  const token = await getOAuthToken(profile.id);
  if (!token) return { ok: true, data: { done: true } };

  // 1. Stop le webhook channel côté Google.
  await unregisterWebhook(profile.id);

  // 2. Revoke le refresh token côté Google (best-effort).
  try {
    const refresh = decryptToken(token.encrypted_refresh_token);
    await revokeToken(refresh);
  } catch (err) {
    console.warn(
      '[google/disconnect] revoke-failed user=%s msg=%s',
      profile.id,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 3. Cleanup DB : supprime la connexion + délie les events (sync_status NULL).
  await deleteOAuthToken(profile.id);
  const supabase = getSupabaseServiceClient();
  await supabase
    .from('calendar_events')
    .update({ sync_status: null, google_etag: null } as never)
    .eq('user_id', profile.id);

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'users',
    entity_id: profile.id,
    action: 'update',
    after: { kind: 'google_calendar_disconnected' } as never,
  });

  revalidatePath('/admin/calendar/settings');
  return { ok: true, data: { done: true } };
}

// ─── Change calendrier cible ────────────────────────────────────────────
const setCalendarSchema = z.object({ calendar_id: z.string().trim().min(1).max(512) });

export async function setSyncCalendarAction(
  input: z.infer<typeof setCalendarSchema>,
): Promise<GoogleSyncResult<{ calendar_id: string }>> {
  const profile = await requireAdminProfile();
  const parsed = setCalendarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Calendrier invalide.' };
  const token = await getOAuthToken(profile.id);
  if (!token) return { ok: false, error: 'Google non connecté.' };

  await updateOAuthToken(profile.id, {
    google_calendar_id: parsed.data.calendar_id,
    sync_token: null, // reset incrémental : nouveau calendrier = nouvelle baseline.
  });
  // Re-enregistre le watch sur le nouveau calendrier.
  if (token.sync_enabled) await registerWebhook(profile.id);

  revalidatePath('/admin/calendar/settings');
  return { ok: true, data: { calendar_id: parsed.data.calendar_id } };
}

// ─── Toggle sync activée ────────────────────────────────────────────────
const toggleSchema = z.object({ enabled: z.boolean() });

export async function toggleSyncEnabledAction(
  input: z.infer<typeof toggleSchema>,
): Promise<GoogleSyncResult<{ enabled: boolean }>> {
  const profile = await requireAdminProfile();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Valeur invalide.' };
  const token = await getOAuthToken(profile.id);
  if (!token) return { ok: false, error: 'Google non connecté.' };

  await updateOAuthToken(profile.id, { sync_enabled: parsed.data.enabled });
  if (parsed.data.enabled) {
    await registerWebhook(profile.id);
  } else {
    await unregisterWebhook(profile.id);
  }

  revalidatePath('/admin/calendar/settings');
  return { ok: true, data: { enabled: parsed.data.enabled } };
}

// ─── Liste les calendriers de l'user (dropdown) ─────────────────────────
export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

export async function listGoogleCalendarsAction(): Promise<
  GoogleSyncResult<GoogleCalendarOption[]>
> {
  const profile = await requireAdminProfile();
  const authCtx = await getAuthenticatedClientForUser(profile.id);
  if (!authCtx) return { ok: false, error: 'Google non connecté.' };
  try {
    const cal = calendarClient(authCtx.auth);
    const resp = await cal.calendarList.list({ maxResults: 100 });
    const items = (resp.data.items ?? []).map((c) => ({
      id: c.id ?? '',
      summary: c.summary ?? c.id ?? '(sans nom)',
      primary: c.primary ?? false,
    }));
    return { ok: true, data: items.filter((c) => c.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Échec liste calendriers.' };
  }
}

// ─── État de connexion pour la page settings ────────────────────────────
export interface GoogleSyncStatus {
  connected: boolean;
  email: string | null;
  calendarId: string;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export async function getGoogleSyncStatusAction(): Promise<GoogleSyncResult<GoogleSyncStatus>> {
  const profile = await requireAdminProfile();
  const token = await getOAuthToken(profile.id);
  if (!token) {
    return {
      ok: true,
      data: {
        connected: false,
        email: null,
        calendarId: 'primary',
        syncEnabled: false,
        lastSyncedAt: null,
        lastSyncError: null,
      },
    };
  }
  return {
    ok: true,
    data: {
      connected: true,
      email: token.google_account_email,
      calendarId: token.google_calendar_id,
      syncEnabled: token.sync_enabled,
      lastSyncedAt: token.last_synced_at,
      lastSyncError: token.last_sync_error,
    },
  };
}
