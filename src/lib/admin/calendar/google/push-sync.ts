/**
 * P14.2.SalesCalendarGoogleSync — sync PUSH (MDS → Google).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module.
 * Doctrine [[feedback_force_paris_timezone_doctrine]] : timeZone='Europe/Paris'
 * explicite sur chaque dateTime envoyé à Google.
 *
 * pushEventToGoogle est best-effort : appelée en background depuis les server
 * actions CRUD. En cas d'échec, l'event est flaggé sync_status='pending_push'
 * et le cron /api/cron/google-calendar-sync-retry réessaie.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getAuthenticatedClientForUser, calendarClient } from './oauth-client';
import { getOAuthToken } from './tokens-store';
import type { CalendarEventRow } from '../helpers';

const PARIS_TZ = 'Europe/Paris';

/**
 * Mappe un calendar_event MDS vers un requestBody Google Calendar event.
 * - start/end en dateTime + timeZone Europe/Paris (doctrine).
 * - tasks sans end_at : Google exige un end → on met end = start (event
 *   ponctuel) avec une durée de 0 ; en pratique on pousse surtout
 *   call_relance / meeting qui ont un end_at.
 * - attendees : mappés si présents (P14.2 #9).
 */
function toGoogleEvent(event: CalendarEventRow): Record<string, unknown> {
  const start = event.start_at;
  const end = event.end_at ?? event.start_at;
  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: { dateTime: start, timeZone: PARIS_TZ },
    end: { dateTime: end, timeZone: PARIS_TZ },
    // Statut Google : cancelled si l'event MDS est annulé.
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
  // P14.2 #9 — attendees (si présents).
  if (event.attendees && event.attendees.length > 0) {
    body.attendees = event.attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName ?? undefined,
    }));
  }
  return body;
}

export interface PushResult {
  ok: boolean;
  googleEventId?: string;
  etag?: string;
  meetUrl?: string;
  meetConferenceId?: string;
  error?: string;
}

/**
 * Pousse un event MDS vers Google (insert si pas encore lié, update sinon).
 *
 * @param withMeet  si true ET pas encore de meet_url → demande la création
 *                  d'une conférence Google Meet (conferenceDataVersion=1).
 */
export async function pushEventToGoogle(
  event: CalendarEventRow,
  withMeet = false,
): Promise<PushResult> {
  const token = await getOAuthToken(event.user_id);
  if (!token || !token.sync_enabled) {
    return { ok: false, error: 'not_connected_or_disabled' };
  }
  const authCtx = await getAuthenticatedClientForUser(event.user_id);
  if (!authCtx) return { ok: false, error: 'not_connected' };

  const cal = calendarClient(authCtx.auth);
  const calendarId = authCtx.calendarId;
  const requestBody = toGoogleEvent(event);

  // Conférence Meet : seulement à la création (ou si demandé et pas encore
  // de meet_url). conferenceDataVersion=1 obligatoire pour que Google honore
  // le createRequest.
  const wantMeet = withMeet && !event.meet_url;
  if (wantMeet) {
    (requestBody as Record<string, unknown>).conferenceData = {
      createRequest: {
        // requestId unique idempotent (l'event id MDS).
        requestId: `mds-${event.id}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  // sendUpdates='all' si au moins 1 invité → Google envoie les invitations.
  const sendUpdates: 'all' | 'none' =
    event.attendees && event.attendees.length > 0 ? 'all' : 'none';

  try {
    let googleEventId = event.google_calendar_event_id ?? undefined;
    let resp;
    if (googleEventId) {
      resp = await cal.events.update({
        calendarId,
        eventId: googleEventId,
        requestBody,
        conferenceDataVersion: wantMeet ? 1 : undefined,
        sendUpdates,
      });
    } else {
      resp = await cal.events.insert({
        calendarId,
        requestBody,
        conferenceDataVersion: wantMeet ? 1 : undefined,
        sendUpdates,
      });
      googleEventId = resp.data.id ?? undefined;
    }

    const etag = resp.data.etag ?? undefined;
    const meetUrl = resp.data.hangoutLink ?? undefined;
    const meetConferenceId = resp.data.conferenceData?.conferenceId ?? undefined;
    return {
      ok: true,
      googleEventId,
      etag,
      meetUrl: meetUrl ?? undefined,
      meetConferenceId: meetConferenceId ?? undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Supprime l'event côté Google (best-effort). */
export async function deleteEventFromGoogle(
  userId: string,
  googleEventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authCtx = await getAuthenticatedClientForUser(userId);
  if (!authCtx) return { ok: false, error: 'not_connected' };
  const cal = calendarClient(authCtx.auth);
  try {
    await cal.events.delete({ calendarId: authCtx.calendarId, eventId: googleEventId });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 410 Gone / 404 = déjà supprimé côté Google → considéré OK.
    if (/\b(404|410)\b/.test(msg)) return { ok: true };
    return { ok: false, error: msg };
  }
}

/**
 * Applique le résultat d'un push sur la row calendar_events (persiste
 * google_calendar_event_id, etag, meet_url, sync_status, synced_at).
 * Centralisé ici pour que le hook CRUD et le cron retry partagent la logique.
 */
export async function persistPushResult(eventId: string, result: PushResult): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (result.ok) {
    const patch: Record<string, unknown> = {
      google_calendar_event_id: result.googleEventId ?? null,
      google_etag: result.etag ?? null,
      google_calendar_synced_at: new Date().toISOString(),
      sync_status: 'synced',
    };
    if (result.meetUrl) patch.meet_url = result.meetUrl;
    if (result.meetConferenceId) patch.meet_conference_id = result.meetConferenceId;
    await supabase
      .from('calendar_events')
      .update(patch as never)
      .eq('id', eventId);
  } else if (result.error !== 'not_connected_or_disabled' && result.error !== 'not_connected') {
    // Échec réel (API/réseau) → flag pour retry cron. Si simplement non
    // connecté, on ne flague pas (rien à pousser).
    await supabase
      .from('calendar_events')
      .update({ sync_status: 'pending_push' } as never)
      .eq('id', eventId);
  }
}

/**
 * Helper haut-niveau appelé en background (void) depuis les server actions :
 * push + persist. Avale toute erreur (logguée) — ne casse jamais le CRUD.
 */
export async function pushEventBestEffort(
  event: CalendarEventRow,
  withMeet = false,
): Promise<void> {
  try {
    const result = await pushEventToGoogle(event, withMeet);
    await persistPushResult(event.id, result);
    if (
      !result.ok &&
      result.error !== 'not_connected_or_disabled' &&
      result.error !== 'not_connected'
    ) {
      console.warn('[google/push] event=%s error=%s', event.id, result.error);
    }
  } catch (err) {
    console.warn(
      '[google/push] best-effort-failed event=%s msg=%s',
      event.id,
      err instanceof Error ? err.message : String(err),
    );
  }
}
