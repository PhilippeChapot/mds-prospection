-- Migration 0061 — P5.x.Apollo-bis : champs Apollo manquants sur companies.
--
-- Audit du 2026-05-27 : 95 % des données Apollo étaient perdues à chaque
-- enrich. Les colonnes employee_count, estimated_revenue_eur,
-- parent_company, founded_year, apollo_raw_data existaient déjà (mig 0060)
-- mais 8 champs structurés Apollo n'étaient stockés QUE dans apollo_raw_data
-- (jsonb) — pas requêtables côté code applicatif.
--
-- Cette migration ajoute les 8 colonnes manquantes + 2 index utiles
-- (keywords gin pour search rapide, industry pour grouper).

alter table public.companies
  add column if not exists industry text,
  add column if not exists linkedin_url text,
  add column if not exists phone text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists raw_address text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists state text;

create index if not exists companies_keywords_gin_idx
  on public.companies using gin (keywords);

create index if not exists companies_industry_idx
  on public.companies (industry)
  where industry is not null;

comment on column public.companies.industry is
  'P5.x.Apollo-bis — secteur Apollo (ex. "Marketing & Advertising").';
comment on column public.companies.linkedin_url is
  'P5.x.Apollo-bis — URL LinkedIn de la société.';
comment on column public.companies.phone is
  'P5.x.Apollo-bis — téléphone principal (E.164 si dispo via Apollo).';
comment on column public.companies.keywords is
  'P5.x.Apollo-bis — tableau de mots-clés Apollo (max 30, gin index pour search).';
comment on column public.companies.raw_address is
  'P5.x.Apollo-bis — adresse brute Apollo (1 ligne).';
