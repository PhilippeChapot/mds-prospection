-- Migration 0076 — P5.x.ConnectOnAirDirectoryCache
--
-- Pivot strategique (Cowork 2026-06-04) : pas d acces aux specs API live de
-- ConnectOnAir, mais Phil exporte la base CoA en XLSX. On cache localement
-- les contacts CoA pour enrichir les `companies` en SELECT plutot qu en
-- appel API.
--
-- Pattern reutilisable pour futurs directories (SATIS, RDE, etc.) :
-- table normalisee + normalized_name pour matching + raw_data JSONB pour
-- garder toutes les colonnes brutes.
--
-- Coordonne avec :
--   - src/lib/external-events/normalize-query.ts (normalizeNameJs)
--   - src/lib/format/country.ts (normalizeCountryToIso)

create table if not exists public.connectonair_directory (
  id              uuid primary key default gen_random_uuid(),
  source_id       text,                              -- ID CoA si present
  name            text not null,
  normalized_name text not null,                     -- UPPER+UNACCENT applicatif (mirror DB)
  address         text,
  city            text,
  postal_code     text,
  country         text,                              -- ISO 3166-1 alpha-2 (FR par defaut)
  phone           text,
  website         text,
  email           text,
  sector          text,
  raw_data        jsonb,                             -- toutes les colonnes XLSX brutes
  imported_at     timestamptz not null default now(),
  import_batch_id uuid                               -- traque un batch d import
);

create index if not exists idx_coa_directory_normalized_name
  on public.connectonair_directory(normalized_name);

create index if not exists idx_coa_directory_source_id
  on public.connectonair_directory(source_id)
  where source_id is not null;

create index if not exists idx_coa_directory_imported_at
  on public.connectonair_directory(imported_at desc);

-- Unique constraint sur source_id (quand present) pour upsert idempotent
-- depuis le script d import. Sans source_id, le script dedup sur
-- normalized_name applicativement.
create unique index if not exists uniq_coa_directory_source_id
  on public.connectonair_directory(source_id)
  where source_id is not null;

-- RLS [[feedback_rls_systematic]] : service_role only.
alter table public.connectonair_directory enable row level security;

drop policy if exists "service_role_all_coa_directory" on public.connectonair_directory;
create policy "service_role_all_coa_directory"
  on public.connectonair_directory
  for all
  to service_role
  using (true)
  with check (true);

-- GRANT [[reference_supabase_data_api_grants]] : Data API expose la table via
-- service_role uniquement (pas d acces anon/authenticated).
grant select, insert, update, delete on public.connectonair_directory to service_role;

comment on table public.connectonair_directory is
  'Cache local de l annuaire ConnectOnAir importe depuis un XLSX. Source pour enrichCompanyAddressFromConnectOnAirAction. Re-importable idempotent via scripts/import-connectonair-export.ts.';
comment on column public.connectonair_directory.normalized_name is
  'UPPER + strip diacritics, mirror du helper applicatif normalizeNameJs.';
comment on column public.connectonair_directory.raw_data is
  'Ligne XLSX brute (toutes colonnes), conservee pour debug/migration future.';

-- ─── Tracking de la source d enrichissement sur companies ───
-- last_enrichment_source : connectonair / apollo / manual / NULL.
-- last_enriched_at      : timestamp du dernier appel reussi.

alter table public.companies
  add column if not exists last_enrichment_source text
    check (
      last_enrichment_source in ('connectonair', 'apollo', 'manual')
      or last_enrichment_source is null
    ),
  add column if not exists last_enriched_at timestamptz;

create index if not exists idx_companies_last_enriched
  on public.companies(last_enriched_at desc)
  where last_enriched_at is not null;

comment on column public.companies.last_enrichment_source is
  'Source du dernier enrichissement d adresse (P5.x.ConnectOnAirDirectoryCache).';
comment on column public.companies.last_enriched_at is
  'Timestamp du dernier enrichissement reussi.';
