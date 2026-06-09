/**
 * P14.2.SalesCalendarGoogleSync — gestion des push channels Google (watch()).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module.
 *
 * Google notifie les changements via un "channel" enregistré par
 * calendar.events.watch(). Le channel expire (~7j max) → renouvellement par
 * cron /api/cron/google-calendar-webhook-renewal. On stocke channel_id +
 * resource_id + token (secret de validation) + expiration en DB.
 */

import { getAuthenticatedClientForUser, calendarClient } from './oauth-client';
import { generateRandomSecret } from './encryption';
import { getOAuthToken, updateOAuthToken } from './tokens-store';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  'https://www.mediadays.solutions';

/** URL publique du webhook PULL (doit être HTTPS joignable par Google). */
export function getWebhookAddress(): string {
  const base = BASE_URL.startsWith('http') ? BASE_URL : `https://${BASE_URL}`;
  return `${base}/api/webhooks/google-calendar`;
}

export interface WatchResult {
  ok: boolean;
  channelId?: string;
  resourceId?: string;
  expiration?: string | null;
  token?: string;
  error?: string;
}

/**
 * Enregistre (ou ré-enregistre) un push channel pour l'user. Stoppe d'abord
 * l'ancien channel s'il existe (évite l'accumulation côté Google).
 */
export async function registerWebhook(userId: string): Promise<WatchResult> {
  const existing = await getOAuthToken(userId);
  if (!existing) return { ok: false, error: 'not_connected' };

  const authCtx = await getAuthenticatedClientForUser(userId);
  if (!authCtx) return { ok: false, error: 'not_connected' };
  const cal = calendarClient(authCtx.auth);

  // Stop ancien channel (best-effort).
  if (existing.webhook_channel_id && existing.webhook_resource_id) {
    try {
      await cal.channels.stop({
        requestBody: {
          id: existing.webhook_channel_id,
          resourceId: existing.webhook_resource_id,
        },
      });
    } catch {
      // ignore — l'ancien channel peut déjà être expiré.
    }
  }

  const channelId = generateRandomSecret(16);
  const webhookToken = generateRandomSecret(24);

  try {
    const resp = await cal.events.watch({
      calendarId: authCtx.calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: getWebhookAddress(),
        token: webhookToken,
      },
    });
    const resourceId = resp.data.resourceId ?? null;
    const expirationMs = resp.data.expiration ? Number(resp.data.expiration) : null;
    const expiration = expirationMs ? new Date(expirationMs).toISOString() : null;

    await updateOAuthToken(userId, {
      webhook_channel_id: channelId,
      webhook_resource_id: resourceId,
      webhook_token: webhookToken,
      webhook_expires_at: expiration,
    });

    return {
      ok: true,
      channelId,
      resourceId: resourceId ?? undefined,
      expiration,
      token: webhookToken,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Stoppe le push channel + nettoie les colonnes webhook (déconnexion). */
export async function unregisterWebhook(userId: string): Promise<void> {
  const token = await getOAuthToken(userId);
  if (!token?.webhook_channel_id || !token.webhook_resource_id) return;
  const authCtx = await getAuthenticatedClientForUser(userId);
  if (authCtx) {
    const cal = calendarClient(authCtx.auth);
    try {
      await cal.channels.stop({
        requestBody: { id: token.webhook_channel_id, resourceId: token.webhook_resource_id },
      });
    } catch {
      // ignore
    }
  }
  await updateOAuthToken(userId, {
    webhook_channel_id: null,
    webhook_resource_id: null,
    webhook_token: null,
    webhook_expires_at: null,
  });
}
