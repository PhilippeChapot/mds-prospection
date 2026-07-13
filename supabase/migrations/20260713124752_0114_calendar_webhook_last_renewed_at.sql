-- Migration 0114 — Traçabilité du renouvellement webhook Google Calendar.
--
-- Le cron /api/cron/google-calendar-webhook-renewal (P14.5) renouvelle les
-- push channels avant expiration mais ne trace pas la date du dernier
-- renouvellement réussi. Ajoute webhook_last_renewed_at pour debug/monitoring
-- (cf. brief GoogleCalendarWebhookAutoRenew).

alter table public.calendar_oauth_tokens
  add column if not exists webhook_last_renewed_at timestamptz;

comment on column public.calendar_oauth_tokens.webhook_last_renewed_at is
  'Horodatage du dernier renouvellement réussi du push channel (cron google-calendar-webhook-renewal). NULL = jamais renouvelé depuis connexion.';
