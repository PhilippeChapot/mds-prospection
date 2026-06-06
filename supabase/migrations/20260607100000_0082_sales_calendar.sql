-- Migration 0082 — P14.1.SalesCalendarCore (Commit 1 — foundation DB)
--
-- Calendrier sales : table calendar_events + EXCLUDE constraint anti-overlap +
-- indexes performance + RLS + GRANT. Cible RBAC :
--   - sales      = ses propres events (filter par user_id applicatif).
--   - admin      = idem + ceux de l equipe (broader filter).
--   - super_admin = tous (peut aussi forcer un overlap, cf. helper).
--
-- 3 types d events : call_relance | meeting | task. La task est nullable sur
-- end_at (todo sans heure precise) ; les 2 autres ont obligatoirement un
-- end_at car ils consomment un creneau.
--
-- Anti-conflit : EXCLUDE USING gist (user_id WITH =, tstzrange WITH &&)
-- empeche 2 events qui se chevauchent sur le meme user (defense en
-- profondeur cote DB). L UI verifie aussi en amont via checkOverlap pour
-- afficher un warning friendly avant de tenter l INSERT.

-- ─── Extension btree_gist requise pour EXCLUDE USING gist ───
create extension if not exists btree_gist;

-- ─── Enums ───
do $$ begin
  create type public.calendar_event_type as enum ('call_relance', 'meeting', 'task');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.calendar_event_status as enum ('pending', 'done', 'cancelled', 'missed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.calendar_event_priority as enum ('low', 'normal', 'high');
exception when duplicate_object then null;
end $$;

-- ─── Table calendar_events ───
create table if not exists public.calendar_events (
  id                          uuid primary key default gen_random_uuid(),

  -- Owner : FK vers public.users (qui FK lui-meme vers auth.users).
  user_id                     uuid not null references public.users(id) on delete cascade,

  -- Lien optionnel vers un prospect (set null si prospect supprime).
  prospect_id                 uuid references public.prospects(id) on delete set null,

  -- Metadonnees event.
  event_type                  public.calendar_event_type not null default 'task',
  status                      public.calendar_event_status not null default 'pending',
  priority                    public.calendar_event_priority not null default 'normal',
  title                       text not null,
  description                 text,
  location                    text,

  -- Temporel.
  start_at                    timestamptz not null,
  end_at                      timestamptz,
  is_all_day                  boolean not null default false,
  duration_minutes            integer generated always as (
    case
      when end_at is not null then extract(epoch from (end_at - start_at)) / 60
      else null
    end
  ) stored,

  -- Resultat (call_relance / meeting : "Pas de reponse" / "Demo OK" / etc.).
  outcome                     text,

  -- Notifications idempotentes (cron Vercel les flag apres envoi).
  reminder_15min_sent_at      timestamptz,
  reminder_1h_sent_at         timestamptz,
  reminder_24h_sent_at        timestamptz,

  -- Audit.
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by_user_id          uuid references public.users(id),

  -- Sync Google Calendar (P14.2 — colonnes prepa, pas utilisees V1).
  google_calendar_event_id    text,
  google_calendar_synced_at   timestamptz,

  -- Contrainte : end_at >= start_at quand end_at present.
  constraint calendar_events_end_after_start
    check (end_at is null or end_at >= start_at)
);

-- ─── Anti-overlap : 2 events qui se chevauchent sur meme user → reject ───
-- Cible : events avec end_at non null + status NOT IN cancelled/done.
-- WHERE = filter partiel (EXCLUDE n applique la contrainte que pour les
-- rows qui matchent ce WHERE).
alter table public.calendar_events
  drop constraint if exists calendar_events_no_overlap_same_user;

alter table public.calendar_events
  add constraint calendar_events_no_overlap_same_user
  exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at, '[]') with &&
  )
  where (end_at is not null and status not in ('cancelled', 'done'));

-- ─── Indexes performance ───
create index if not exists idx_calendar_events_user_start
  on public.calendar_events(user_id, start_at);

create index if not exists idx_calendar_events_prospect
  on public.calendar_events(prospect_id)
  where prospect_id is not null;

create index if not exists idx_calendar_events_status_pending
  on public.calendar_events(start_at)
  where status = 'pending';

-- Index pour le cron reminders : balayage rapide des events futurs sans
-- reminder envoye.
create index if not exists idx_calendar_events_reminders_pending
  on public.calendar_events(start_at)
  where status = 'pending'
    and (
      reminder_15min_sent_at is null
      or reminder_1h_sent_at is null
      or reminder_24h_sent_at is null
    );

-- ─── RLS [[feedback_rls_systematic]] ───
alter table public.calendar_events enable row level security;

drop policy if exists "service_role_all_calendar_events" on public.calendar_events;
create policy "service_role_all_calendar_events"
  on public.calendar_events
  for all
  to service_role
  using (true)
  with check (true);

-- ─── GRANT [[reference_supabase_data_api_grants]] ───
grant select, insert, update, delete on public.calendar_events to service_role;

-- ─── Token .ics par user (consomme en commit 5) ───
-- Genere a la demande quand l user souhaite s abonner depuis Apple/Google
-- Calendar. UUID v4 random, regenerable.
alter table public.users
  add column if not exists calendar_ics_token uuid;

create unique index if not exists uniq_users_calendar_ics_token
  on public.users(calendar_ics_token)
  where calendar_ics_token is not null;

comment on table public.calendar_events is
  'P14.1.SalesCalendarCore — events calendrier sales (call_relance/meeting/task). Anti-overlap via EXCLUDE constraint. Lien optionnel vers prospects.';
comment on column public.calendar_events.duration_minutes is
  'Colonne calculee (epoch end-start / 60). Null si end_at null (task sans duree).';
comment on column public.calendar_events.outcome is
  'Resultat libre apres event done (ex: "Pas de reponse", "Demo prise", "Qualifie"). Affichage historique sur fiche prospect.';
comment on column public.users.calendar_ics_token is
  'Token UUID secret pour souscription .ics (Apple/Google Calendar read-only). Regenerable si compromis.';
