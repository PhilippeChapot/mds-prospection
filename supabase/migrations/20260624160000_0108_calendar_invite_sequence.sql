-- P14.x.CalendarExternalInvites — SEQUENCE iCalendar (RFC 5545) pour les
-- invitations externes. Incrémenté à chaque update d'un RDV (event_type
-- 'meeting') pour que les clients mail honorent UPDATE/CANCEL.
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS invite_sequence INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.calendar_events.invite_sequence IS
  'P14.x — SEQUENCE iCalendar pour invitations externes (RDV only). Incrémenté à chaque update envoyé.';
