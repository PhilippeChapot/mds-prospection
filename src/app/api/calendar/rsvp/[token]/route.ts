/**
 * P14.x.CalendarExternalInvites — endpoint RSVP public (lien dans l'email).
 * GET /api/calendar/rsvp/{token}?r=accepted|declined|tentative
 *
 * Vérifie le JWT (RSVP_JWT_SECRET), met à jour responseStatus de l'attendee
 * dans calendar_events.attendees (JSONB), renvoie une page HTML de confirmation.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { verifyRsvpToken, RsvpTokenError } from '@/lib/calendar/rsvp-jwt';
import { notifyOwnerOfRsvp } from '@/lib/admin/calendar/rsvp-notify';
import type { AttendeeRecord } from '@/lib/admin/calendar/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RsvpResponse = 'accepted' | 'declined' | 'tentative';
const VALID: RsvpResponse[] = ['accepted', 'declined', 'tentative'];

const LABEL: Record<RsvpResponse, string> = {
  accepted: 'Présence confirmée ✓',
  declined: 'Absence enregistrée',
  tentative: 'Réponse « peut-être » enregistrée',
};

function page(title: string, message: string, color: string): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f8;">
  <div style="max-width:480px;margin:60px auto;background:white;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06);">
    <div style="font-size:48px;margin-bottom:8px;">${color}</div>
    <h1 style="font-size:20px;color:#1F2240;margin:0 0 8px;">${title}</h1>
    <p style="color:#5A6080;font-size:14px;line-height:1.5;margin:0;">${message}</p>
    <p style="color:#9aa0b4;font-size:12px;margin-top:24px;">MediaDays Solutions</p>
  </div>
</body></html>`;
  return new globalThis.Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const r = url.searchParams.get('r') as RsvpResponse | null;

  if (!r || !VALID.includes(r)) {
    return page('Réponse invalide', 'Le lien utilisé est incomplet ou incorrect.', '⚠️');
  }

  let claims: { eventId: string; email: string };
  try {
    claims = await verifyRsvpToken(token);
  } catch (err) {
    const expired = err instanceof RsvpTokenError && err.code === 'expired';
    return page(
      expired ? 'Lien expiré' : 'Lien invalide',
      expired
        ? 'Ce lien de réponse a expiré. Contactez l’organisateur.'
        : 'Ce lien de réponse est invalide.',
      '⚠️',
    );
  }

  const db = getSupabaseServiceClient() as unknown as SupabaseClient;
  const { data: event } = await db
    .from('calendar_events')
    .select('*')
    .eq('id', claims.eventId)
    .maybeSingle();
  if (!event) {
    return page('Événement introuvable', 'Ce rendez-vous n’existe plus.', '⚠️');
  }

  const target = claims.email.trim().toLowerCase();
  const prior = ((event.attendees as AttendeeRecord[] | null) ?? []).find(
    (a) => a.email?.trim().toLowerCase() === target,
  );
  const oldStatus = prior?.responseStatus ?? 'needsAction';
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const attendees = ((event.attendees as AttendeeRecord[] | null) ?? []).map((a) =>
    a.email?.trim().toLowerCase() === target
      ? { ...a, responseStatus: r, responded_at: nowIso }
      : a,
  );
  await db
    .from('calendar_events')
    .update({ attendees } as never)
    .eq('id', claims.eventId);

  // P14.x.RSVP-UI — notifie l'owner (idempotence + throttle, best-effort).
  try {
    await notifyOwnerOfRsvp(db, {
      eventId: claims.eventId,
      ownerUserId: event.user_id as string,
      eventTitle: (event.title as string) ?? 'Rendez-vous',
      startAt: event.start_at as string,
      attendees,
      responderEmail: claims.email,
      responderName: prior?.displayName ?? claims.email,
      oldStatus,
      newStatus: r,
      lastNotificationAt:
        (event as { last_rsvp_notification_at?: string | null }).last_rsvp_notification_at ?? null,
      nowMs,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions',
    });
  } catch {
    /* best-effort */
  }

  const emoji = r === 'accepted' ? '✅' : r === 'declined' ? '❌' : '🤔';
  return page(LABEL[r], 'Merci, votre réponse a bien été transmise à l’organisateur.', emoji);
}
