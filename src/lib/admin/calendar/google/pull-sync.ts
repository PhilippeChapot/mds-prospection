/**
 * P14.2.SalesCalendarGoogleSync — sync PULL (Google → MDS).
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : pure module.
 *
 * Flux :
 *   1. Le webhook /api/webhooks/google-calendar reçoit une notification push.
 *   2. Il appelle syncEventsFromGoogle(userId) → events.list incrémental via
 *      syncToken stocké (full sync timeMin=now au 1er passage).
 *   3. Chaque event Google passe par reconcileGoogleEventToMds :
 *        - status='cancelled' → DELETE la row MDS liée.
 *        - même etag que stocké → no-op (anti-boucle push/pull).
 *        - sinon UPSERT (insert si nouveau, update si déjà lié).
 *   4. On persiste le nextSyncToken pour le prochain run.
 *
 * Anti-boucle : un event qu'on vient de PUSH revient dans le PULL avec le
 * même etag qu'on a stocké → reconcile détecte l'égalité et ne ré-écrit pas.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getAuthenticatedClientForUser, calendarClient } from './oauth-client';
import { getOAuthToken, updateOAuthToken } from './tokens-store';
import type { calendar_v3 } from 'googleapis';
import type { CalendarEventType, AttendeeRecord } from '../helpers';

export interface PullStats {
  ok: boolean;
  imported: number;
  updated: number;
  deleted: number;
  skipped: number;
  error?: string;
}

/**
 * Devine le type d'event MDS depuis un event Google :
 *   - conférence Meet OU attendees → meeting.
 *   - sinon → meeting par défaut (un event Google a toujours une durée).
 * (On ne crée pas de call_relance/task depuis Google : ces types sont
 * spécifiques au workflow MDS.)
 */
function inferEventType(g: calendar_v3.Schema$Event): CalendarEventType {
  void g;
  return 'meeting';
}

/**
 * Réconcilie UN event Google avec MDS. Retourne l'action effectuée.
 */
export async function reconcileGoogleEventToMds(
  userId: string,
  g: calendar_v3.Schema$Event,
): Promise<'imported' | 'updated' | 'deleted' | 'skipped'> {
  // Client untyped : les colonnes sync (google_etag, sync_status, meet_url)
  // ne sont pas encore dans database.types.ts tant que la migration 0090
  // n'est pas appliquée (doctrine [[feedback_supabase_mcp_migration_drift]]).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const googleId = g.id;
  if (!googleId) return 'skipped';

  // Cherche la row MDS déjà liée à cet event Google.
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, google_etag, user_id, attendees')
    .eq('google_calendar_event_id', googleId)
    .maybeSingle();

  // 1. Annulation côté Google → suppression MDS.
  if (g.status === 'cancelled') {
    if (existing) {
      await supabase
        .from('calendar_events')
        .delete()
        .eq('id', (existing as { id: string }).id);
      return 'deleted';
    }
    return 'skipped';
  }

  // 2. Anti-boucle : etag identique → rien à faire.
  if (existing && (existing as { google_etag?: string }).google_etag === g.etag) {
    return 'skipped';
  }

  // 3. Mapping des champs.
  const startAt = g.start?.dateTime ?? (g.start?.date ? `${g.start.date}T00:00:00Z` : null);
  const endAt = g.end?.dateTime ?? (g.end?.date ? `${g.end.date}T00:00:00Z` : null);
  if (!startAt) return 'skipped'; // event sans début exploitable.

  const meetUrl = g.hangoutLink ?? null;
  const meetConferenceId = g.conferenceData?.conferenceId ?? null;

  // P14.2 #9 — synchronise les attendees depuis Google (responseStatus).
  // On merge : pour chaque invité Google, on préserve le contact_id déjà
  // stocké côté MDS si l'email matche ; on résout les nouveaux contacts.
  const googleAttendees = g.attendees ?? [];
  let attendees: AttendeeRecord[] = [];
  if (googleAttendees.length > 0) {
    const emails = googleAttendees.map((a) => a.email).filter((e): e is string => !!e);
    const contactMap = new Map<string, string>(); // email.lower → contact_id
    if (emails.length > 0) {
      const { data: foundContacts } = await supabase
        .from('contacts')
        .select('id, email')
        .in('email', emails);
      type CR = { id: string; email: string };
      for (const c of (foundContacts ?? []) as CR[]) {
        if (c.email) contactMap.set(c.email.toLowerCase(), c.id);
      }
    }
    // Préserve contact_id depuis la row MDS existante si disponible.
    const existingAttendeesMap = new Map<string, string | null | undefined>();
    const existingAttendees =
      (existing as { attendees?: AttendeeRecord[] } | null)?.attendees ?? [];
    for (const a of existingAttendees) {
      existingAttendeesMap.set(a.email.toLowerCase(), a.contact_id);
    }
    attendees = googleAttendees
      .filter((a) => !!a.email)
      .map((a) => {
        const emailLower = a.email!.toLowerCase();
        return {
          email: a.email!,
          displayName: a.displayName ?? null,
          responseStatus: (a.responseStatus as AttendeeRecord['responseStatus']) ?? 'needsAction',
          contact_id: existingAttendeesMap.get(emailLower) ?? contactMap.get(emailLower) ?? null,
        };
      });
  }

  const baseFields = {
    title: g.summary ?? '(sans titre)',
    description: g.description ?? null,
    location: g.location ?? null,
    start_at: new Date(startAt).toISOString(),
    end_at: endAt ? new Date(endAt).toISOString() : null,
    google_calendar_event_id: googleId,
    google_etag: g.etag ?? null,
    google_calendar_synced_at: new Date().toISOString(),
    sync_status: 'synced' as const,
    meet_url: meetUrl,
    meet_conference_id: meetConferenceId,
    attendees,
  };

  // 4. Update si déjà lié.
  if (existing) {
    await supabase
      .from('calendar_events')
      .update(baseFields as never)
      .eq('id', (existing as { id: string }).id);
    return 'updated';
  }

  // 5. Insert nouveau. L'EXCLUDE constraint anti-overlap peut rejeter (23P01)
  //    un event Google qui chevauche un event MDS existant : on skip
  //    proprement plutôt que de planter le PULL.
  const { error } = await supabase.from('calendar_events').insert({
    user_id: userId,
    event_type: inferEventType(g),
    status: 'pending',
    priority: 'normal',
    ...baseFields,
  } as never);
  if (error) {
    if (error.code === '23P01') {
      console.warn('[google/pull] overlap-skip google=%s user=%s', googleId, userId);
      return 'skipped';
    }
    console.warn('[google/pull] insert-failed google=%s msg=%s', googleId, error.message);
    return 'skipped';
  }
  return 'imported';
}

/**
 * Sync incrémental des events Google d'un user vers MDS.
 * Gère la pagination + le nextSyncToken. Si Google renvoie 410 (sync token
 * expiré), on repart en full sync (timeMin=now).
 */
export async function syncEventsFromGoogle(userId: string): Promise<PullStats> {
  const token = await getOAuthToken(userId);
  if (!token || !token.sync_enabled) {
    return { ok: false, imported: 0, updated: 0, deleted: 0, skipped: 0, error: 'not_connected' };
  }
  const authCtx = await getAuthenticatedClientForUser(userId);
  if (!authCtx) {
    return { ok: false, imported: 0, updated: 0, deleted: 0, skipped: 0, error: 'not_connected' };
  }
  const cal = calendarClient(authCtx.auth);
  const calendarId = authCtx.calendarId;

  const stats: PullStats = { ok: true, imported: 0, updated: 0, deleted: 0, skipped: 0 };
  let pageToken: string | undefined;
  let syncToken: string | undefined = token.sync_token ?? undefined;
  let nextSyncToken: string | undefined;
  let usedFullSync = false;

  // Boucle de pagination.
  for (let guard = 0; guard < 50; guard++) {
    let resp;
    try {
      resp = await cal.events.list({
        calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        ...(syncToken
          ? { syncToken }
          : { timeMin: new Date().toISOString(), orderBy: 'startTime' }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 410 Gone → syncToken invalide. Reset + full sync une seule fois.
      if (/\b410\b/.test(msg) && !usedFullSync) {
        usedFullSync = true;
        syncToken = undefined;
        pageToken = undefined;
        await updateOAuthToken(userId, { sync_token: null });
        continue;
      }
      await updateOAuthToken(userId, { last_sync_error: msg });
      return { ...stats, ok: false, error: msg };
    }

    for (const g of resp.data.items ?? []) {
      const action = await reconcileGoogleEventToMds(userId, g);
      if (action === 'imported') stats.imported++;
      else if (action === 'updated') stats.updated++;
      else if (action === 'deleted') stats.deleted++;
      else stats.skipped++;
    }

    if (resp.data.nextPageToken) {
      pageToken = resp.data.nextPageToken;
      continue;
    }
    nextSyncToken = resp.data.nextSyncToken ?? undefined;
    break;
  }

  await updateOAuthToken(userId, {
    sync_token: nextSyncToken ?? token.sync_token ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_error: null,
  });
  return stats;
}
