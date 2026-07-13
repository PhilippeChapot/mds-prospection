/**
 * P14.2.SalesCalendarGoogleSync — cron renouvellement webhooks (1×/jour, 3h).
 *
 * Les push channels Google expirent (~7j max). Ce cron ré-enregistre les
 * channels dont l'expiration approche (< 48h) ou est absente, pour les
 * connexions sync_enabled. registerWebhook stoppe l'ancien channel avant
 * d'en créer un neuf.
 *
 * Sur succès : trace webhook_last_renewed_at + audit_log (calendar_webhook_renewed).
 * Sur échec : email d'alerte Resend à l'admin (best-effort, ne bloque pas la boucle).
 *
 * Auth : header x-vercel-cron (Vercel Cron interne) OU CRON_SECRET en Bearer
 * (tests manuels curl) — cf. fix [[feedback_lifecycle_cron_doctrine]] sur sync-emails.
 */

import { NextResponse } from 'next/server';
import {
  listTokensForWebhookRenewal,
  updateOAuthToken,
  type OAuthTokenRow,
} from '@/lib/admin/calendar/google/tokens-store';
import { registerWebhook, type WatchResult } from '@/lib/admin/calendar/google/webhook-manager';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { renderCalendarWebhookRenewalFailedEmail } from '@/lib/resend/templates/admin-notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RENEW_WINDOW_MS = 48 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const auth = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  return Boolean(expected) && auth === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new NextResponse('Unauthorized', { status: 401 });

  const startedAt = Date.now();
  const now = Date.now();
  const threshold = new Date(now + RENEW_WINDOW_MS).toISOString();
  const tokens = await listTokensForWebhookRenewal(threshold);

  // Désactive la sync quand un webhook DÉJÀ expiré ne peut pas être renouvelé :
  // le refresh token est probablement révoqué → l'UI doit inviter à reconnecter
  // (sinon échec silencieux permanent, cf. webhook de Phil expiré 15 jours).
  const stats = { candidates: tokens.length, renewed: 0, errors: 0, disabled: 0 };
  for (const token of tokens) {
    try {
      const r = await registerWebhook(token.user_id);
      if (r.ok) {
        stats.renewed++;
        await logWebhookRenewed(token.user_id, r);
        continue;
      }
      stats.errors++;
      const expIso = token.webhook_expires_at;
      const alreadyExpired = expIso !== null && new Date(expIso).getTime() < now;
      if (alreadyExpired) {
        await updateOAuthToken(token.user_id, {
          sync_enabled: false,
          last_sync_error: `Webhook renewal failed (reconnexion requise) : ${r.error ?? 'unknown'}`,
        });
        stats.disabled++;
        console.warn(
          '[google-webhook-renewal] user=%s disabled (webhook expiré + renew KO): %s',
          token.user_id,
          r.error,
        );
      }
      await alertRenewalFailure(token, r.error ?? 'unknown');
    } catch (err) {
      stats.errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[google-webhook-renewal] user=%s msg=%s', token.user_id, message);
      await alertRenewalFailure(token, message);
    }
  }

  return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...stats });
}

/** Audit log best-effort — n'échoue jamais la boucle du cron. */
async function logWebhookRenewed(userId: string, r: WatchResult): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from('audit_log').insert({
      user_id: userId,
      entity_type: 'calendar_oauth_tokens',
      entity_id: userId,
      action: 'update',
      after: {
        kind: 'calendar_webhook_renewed',
        channel_id: r.channelId ?? null,
        resource_id: r.resourceId ?? null,
        expiration: r.expiration ?? null,
      } as never,
    });
  } catch (err) {
    console.warn(
      '[google-webhook-renewal] audit-log-failed user=%s msg=%s',
      userId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

const SETTINGS_URL = `${(
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions'
).replace(/\/$/, '')}/admin/calendar/settings`;

/** Email d'alerte Resend best-effort — n'échoue jamais la boucle du cron. */
async function alertRenewalFailure(token: OAuthTokenRow, errorMessage: string): Promise<void> {
  try {
    const tpl = renderCalendarWebhookRenewalFailedEmail({
      settingsUrl: SETTINGS_URL,
      googleAccountEmail: token.google_account_email,
      errorMessage,
      webhookExpiresAt: token.webhook_expires_at,
    });
    await sendAdminNotification('admin_calendar_webhook_renewal_failed', tpl);
  } catch (err) {
    console.warn(
      '[google-webhook-renewal] alert-email-failed user=%s msg=%s',
      token.user_id,
      err instanceof Error ? err.message : String(err),
    );
  }
}
