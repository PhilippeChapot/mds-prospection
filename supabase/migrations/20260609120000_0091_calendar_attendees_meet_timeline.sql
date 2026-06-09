-- Migration 0091 — P14.2 #8+#9 (bundle)
-- Chantier unifié : invités calendrier + chip Meet/attendees sur la timeline.
--
-- 2 volets :
--   1. Colonne attendees JSONB sur calendar_events.
--      Format : [{email, displayName, responseStatus, contact_id}].
--      Alimentée par les server actions (create/update) + réconcilié depuis
--      Google sur le PULL webhook (response_status accepté/refusé/etc.).
--      sendUpdates='all' si au moins 1 invité → Google envoie les invitations.
--
--   2. Recréation de prospect_timeline_view pour exposer meet_url +
--      meet_conference_id + attendees (posées en migration 0090).
--      Permet au CalendarEventEntry (chip timeline P14.3) d'afficher
--      le mini bouton 🎥 et le résumé "👥 N (X✅ Y❌)".
--
-- Prérequis : migrations 0090 (meet_url, meet_conference_id, google_etag,
-- sync_status sur calendar_events + table calendar_oauth_tokens).

-- ─── Colonne attendees ──────────────────────────────────────────────────
alter table public.calendar_events
  add column if not exists attendees jsonb not null default '[]'::jsonb;

create index if not exists idx_calendar_events_attendees
  on public.calendar_events
  using gin (attendees jsonb_path_ops);

comment on column public.calendar_events.attendees is
  'P14.2 #9 — liste invités [{email, displayName, responseStatus, contact_id}]. Sync Google bidirectionnel (sendUpdates=''all'' si au moins 1 invité).';

-- ─── Vue prospect_timeline_view (recréation) ───────────────────────────
-- On DROP/CREATE plutôt que CREATE OR REPLACE car le nombre de colonnes
-- a changé (3 nouvelles : meet_url, meet_conference_id, attendees).
-- Doctrine [[feedback_supabase_extensions_schema]] : vue dans public.

drop view if exists public.prospect_timeline_view;

create view public.prospect_timeline_view as

  -- Notes manuelles (soft-delete filtrées).
  select
    pn.id,
    pn.prospect_id,
    'note'::text              as entry_type,
    pn.created_at             as event_at,
    pn.author_user_id         as actor_user_id,
    pn.contact_id,
    pn.content,
    null::text                as calendar_event_type,
    null::text                as calendar_event_status,
    null::timestamptz         as calendar_event_start,
    null::timestamptz         as calendar_event_end,
    null::text                as meet_url,
    null::text                as meet_conference_id,
    null::jsonb               as attendees
  from public.prospect_notes pn
  where pn.deleted_at is null

  union all

  -- Calendar events liés au prospect (pending/done/missed).
  -- cancelled exclus : pas pertinent pour l'historique passage-de-relais.
  select
    ce.id,
    ce.prospect_id,
    'calendar_event'::text                                   as entry_type,
    -- event_at = date de l'event (pas de création) pour ordre chronologique
    -- reflétant le moment de l'action commerciale.
    ce.start_at                                              as event_at,
    ce.user_id                                               as actor_user_id,
    null::uuid                                               as contact_id,
    ce.title || coalesce(' — ' || ce.description, '')        as content,
    ce.event_type::text                                      as calendar_event_type,
    ce.status::text                                          as calendar_event_status,
    ce.start_at                                              as calendar_event_start,
    ce.end_at                                                as calendar_event_end,
    ce.meet_url,
    ce.meet_conference_id,
    ce.attendees
  from public.calendar_events ce
  where ce.prospect_id is not null
    and ce.status != 'cancelled';

comment on view public.prospect_timeline_view is
  'P14.3 : timeline unifiée fiche prospect = notes (prospect_notes) UNION calendar_events. P14.2 #8/#9 : expose meet_url + meet_conference_id + attendees côté calendar_event.';

grant select on public.prospect_timeline_view to service_role;
