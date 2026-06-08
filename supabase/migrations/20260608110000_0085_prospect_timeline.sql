-- Migration 0085 — P14.3.ProspectTimelineDrawer
--
-- Timeline notes chat-like sur fiche prospect avec :
--   - Notes manuelles auto-datees + auteur + contact tag optionnel.
--   - Auto-entries depuis calendar_events (P14.1 SalesCalendarCore).
--
-- Phase 0 audit (2026-06-08) :
--   - prospects.notes (text nullable) existe deja = champ plat actuel.
--     V1 : on NE migre PAS son contenu vers prospect_notes (Phil peut
--     faire un script separe s il veut). On garde les 2 cote a cote ;
--     V2 pourra deprecier prospects.notes si la timeline remplace tout.
--   - Pas de fonction update_updated_at_column → on gere updated_at
--     cote app code (pattern P12.x).

-- ─── Table prospect_notes ───
create table if not exists public.prospect_notes (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references public.prospects(id) on delete cascade,
  -- FK vers public.users (qui FK lui-meme vers auth.users). Cohérent
  -- avec P14.1 calendar_events.user_id.
  author_user_id  uuid references public.users(id) on delete set null,
  -- Contact tagué (optionnel) : doit appartenir a la company du prospect
  -- (validation cote server action, pas en DB pour eviter sub-select FK).
  contact_id      uuid references public.contacts(id) on delete set null,
  content         text not null check (length(content) > 0 and length(content) <= 10000),
  -- Soft delete (super_admin OR author).
  deleted_at      timestamptz,
  deleted_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_prospect_notes_prospect
  on public.prospect_notes(prospect_id, created_at desc);

create index if not exists idx_prospect_notes_contact
  on public.prospect_notes(contact_id)
  where contact_id is not null;

create index if not exists idx_prospect_notes_author
  on public.prospect_notes(author_user_id)
  where author_user_id is not null;

-- ─── RLS [[feedback_rls_systematic]] ───
alter table public.prospect_notes enable row level security;

drop policy if exists "service_role_all_prospect_notes" on public.prospect_notes;
create policy "service_role_all_prospect_notes"
  on public.prospect_notes
  for all
  to service_role
  using (true)
  with check (true);

-- ─── GRANT [[reference_supabase_data_api_grants]] ───
grant select, insert, update, delete on public.prospect_notes to service_role;

-- ─── Vue unifiee timeline ───
-- Agrege notes manuelles + calendar_events lies au prospect. Le SELECT
-- est filtre cote app par prospect_id + ORDER BY event_at DESC.
--
-- Note : on garde la vue simple (juste les colonnes minimales) ; les
-- hydratations (author full_name, contact full_name) se font cote app
-- via Promise.all de queries supplementaires pour eviter de coupler la
-- view au schema auth.users (qui est dans le schema auth).

create or replace view public.prospect_timeline_view as
  -- Notes manuelles (soft-delete filtre).
  select
    pn.id,
    pn.prospect_id,
    'note'::text as entry_type,
    pn.created_at as event_at,
    pn.author_user_id as actor_user_id,
    pn.contact_id,
    pn.content,
    null::text as calendar_event_type,
    null::text as calendar_event_status,
    null::timestamptz as calendar_event_start,
    null::timestamptz as calendar_event_end
  from public.prospect_notes pn
  where pn.deleted_at is null

  union all

  -- Calendar events lies au prospect (status pending/done/missed).
  -- On exclut cancelled : pas pertinent pour l historique passage-de-relais.
  select
    ce.id,
    ce.prospect_id,
    'calendar_event'::text as entry_type,
    -- event_at = la date de l event (pas la date de creation), pour que
    -- l ordre chronologique reflete le moment de l action.
    ce.start_at as event_at,
    ce.user_id as actor_user_id,
    null::uuid as contact_id,
    ce.title || coalesce(' — ' || ce.description, '') as content,
    ce.event_type::text as calendar_event_type,
    ce.status::text as calendar_event_status,
    ce.start_at as calendar_event_start,
    ce.end_at as calendar_event_end
  from public.calendar_events ce
  where ce.prospect_id is not null
    and ce.status != 'cancelled';

comment on view public.prospect_timeline_view is
  'P14.3 : timeline unifiee fiche prospect = notes manuelles (prospect_notes) UNION calendar_events lies. Filtre soft-deleted notes + cancelled events.';

grant select on public.prospect_timeline_view to service_role;
