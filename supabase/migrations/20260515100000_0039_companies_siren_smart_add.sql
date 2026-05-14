-- Migration 0039 — P5.x.23
-- SIREN/SIRET sur companies + table smart_add_attempts (audit Smart Add Wizard).
--
-- - Récupéré via API INSEE Sirene v3.11 lors du Smart Add (auto) ou au passage
--   signup → prospect (re-check best-effort). Si plusieurs candidats, on
--   stocke 'siren_ambiguous' dans admin_alerts (la table existe déjà, P5.x.11)
--   et l'admin choisit manuellement via la fiche prospect.
-- - siren_source enregistre la provenance (insee_auto | insee_manual_select |
--   manual_entry). Pas de CHECK constraint pour rester souple sur V1.

alter table public.companies
  add column if not exists siren text,
  add column if not exists siret text,
  add column if not exists siren_verified_at timestamptz,
  add column if not exists siren_source text;

create index if not exists companies_siren_idx
  on public.companies (siren) where siren is not null;

comment on column public.companies.siren is
  'P5.x.23 — SIREN INSEE (9 chiffres). Récupéré via API Sirene au Smart Add ou au passage prospect.';
comment on column public.companies.siret is
  'P5.x.23 — SIRET du siège (14 chiffres). Posé en même temps que siren.';
comment on column public.companies.siren_source is
  'P5.x.23 — Origine : insee_auto | insee_manual_select | manual_entry.';

-- Table d'historique des essais Smart Add (audit + debug + amélioration prompt IA).
create table if not exists public.smart_add_attempts (
  id uuid primary key default gen_random_uuid(),
  raw_input text not null,
  parsed_payload jsonb,
  result jsonb,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists smart_add_attempts_user_idx
  on public.smart_add_attempts (user_id, created_at desc) where user_id is not null;

comment on table public.smart_add_attempts is
  'P5.x.23 — Log des essais Smart Add Wizard. raw_input peut être long (mail, page web) ; surveiller la croissance si table devient > 10k lignes.';
