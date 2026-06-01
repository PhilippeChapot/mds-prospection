-- Migration 0069 — P5.x.ExternalEvents.
--
-- Refactor du tracking PRS (booleen unique sur companies) vers un
-- modele JSONB extensible permettant de stocker la presence d'une
-- societe sur N evenements externes :
--   - PRS (Paris Radio Show) — déjà tracké par was_prs_2026_exhibitor
--   - MD Classic (Havas) — éditions 2023/2024/2025/2026
--   - RDE (Radio Days Europe) — édition 2026
--   - SATIS — édition 2025
--   - CBD (Broadcast Days) — édition 2025
--
-- companies.external_event_tags JSONB :
--   { "prs": [2026], "mediadays_classic": [2023, 2025, 2026],
--     "rde": [2026], "satis": [2025], "cbd": [2025] }
--
-- was_prs_2026_exhibitor reste source de verite pour la categorie
-- tarifaire PRS (pricing/signup). external_event_tags est la source
-- de verite pour l'AFFICHAGE des badges multi-events et le hook
-- signup -> conversation interne prioritaire.
--
-- contacts.import_source + email_confidence : tracking origine
-- contacts et fiabilite des emails (RDE = 'low' car deduits).
--
-- internal_conversations.priority + type 'staff_broadcast' : pour
-- les alertes signup matchant un event externe (notif diffusee a
-- tout le staff, distincte d'un DM 1↔1 ou d'un support).

create extension if not exists unaccent;

-- ============================================================================
-- 1. companies.external_event_tags + review fields
-- ============================================================================

alter table public.companies
  add column if not exists external_event_tags jsonb not null default '{}'::jsonb,
  add column if not exists external_events_review_status text
    check (external_events_review_status in ('unverified', 'verified', 'merged', 'ignored')),
  add column if not exists external_events_review_source text
    check (external_events_review_source in ('md_classic', 'rde', 'satis', 'cbd'));

comment on column public.companies.external_event_tags is
  'P5.x.ExternalEvents - tags JSONB par event externe {prs:[years], mediadays_classic:[years], rde:[years], satis:[years], cbd:[years]}.';
comment on column public.companies.external_events_review_status is
  'P5.x.ExternalEvents - statut arbitrage UI review (NULL = pas un import unverified, unverified/verified/merged/ignored sinon).';
comment on column public.companies.external_events_review_source is
  'P5.x.ExternalEvents - source d origine si import (md_classic/rde/satis/cbd).';

-- Backfill : copie was_prs_2026_exhibitor -> external_event_tags.prs = [2026].
update public.companies
set external_event_tags = jsonb_build_object('prs', jsonb_build_array(2026))
where was_prs_2026_exhibitor = true
  and (external_event_tags = '{}'::jsonb or external_event_tags is null);

-- Index GIN pour les requetes "WHERE external_event_tags ? 'mediadays_classic'".
create index if not exists companies_external_event_tags_gin_idx
  on public.companies using gin (external_event_tags);

create index if not exists companies_review_status_idx
  on public.companies (external_events_review_status)
  where external_events_review_status is not null;

-- ============================================================================
-- 2. contacts.import_source + email_confidence
-- ============================================================================

alter table public.contacts
  add column if not exists import_source text
    check (import_source in (
      'manual', 'apollo', 'sellsy', 'signup',
      'import_md_classic', 'import_rde', 'import_satis', 'import_cbd'
    )),
  add column if not exists email_confidence text not null default 'verified'
    check (email_confidence in ('verified', 'medium', 'low'));

comment on column public.contacts.import_source is
  'P5.x.ExternalEvents - origine du contact (manual/apollo/sellsy/signup/import_*).';
comment on column public.contacts.email_confidence is
  'P5.x.ExternalEvents - fiabilite email (verified standard, medium formulaire, low deduit type RDE).';

create index if not exists contacts_import_source_idx
  on public.contacts (import_source)
  where import_source is not null;

create index if not exists contacts_email_confidence_idx
  on public.contacts (email_confidence)
  where email_confidence != 'verified';

-- ============================================================================
-- 3. internal_conversations.priority + type 'staff_broadcast'
-- ============================================================================

alter table public.internal_conversations
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  add column if not exists metadata jsonb;

-- Etend le check sur type pour autoriser staff_broadcast (alerte staff
-- de masse, ex : signup prioritaire). Le DDL ne permet pas d ajouter
-- une valeur a un check inline -> on drop et recree.
alter table public.internal_conversations
  drop constraint if exists internal_conversations_type_check;
alter table public.internal_conversations
  add constraint internal_conversations_type_check
  check (type in ('staff_dm', 'support', 'staff_broadcast'));

comment on column public.internal_conversations.priority is
  'P5.x.ExternalEvents - priorite affichee dans /admin/messages (badge HAUTE si high).';
comment on column public.internal_conversations.metadata is
  'P5.x.ExternalEvents - metadonnees libres (ex signup id, matched events JSONB).';

create index if not exists internal_conversations_priority_idx
  on public.internal_conversations (priority)
  where priority != 'normal';
