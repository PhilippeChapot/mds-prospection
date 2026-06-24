-- P14.x.RSVP-UI — throttle des notifications RSVP à l'owner du RDV (max 1/min
-- par event). Les statuts/horodatages par invité vivent dans attendees JSONB.
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS last_rsvp_notification_at TIMESTAMPTZ;

COMMENT ON COLUMN public.calendar_events.last_rsvp_notification_at IS
  'P14.x.RSVP-UI — dernier envoi de notification RSVP à l''owner (throttle 1/min).';
