-- Migration 0060 — P5.x.Apollo : intégration Apollo.io.
--
--   - Étend l'enum sync_target avec 'apollo' (logger côté sync_logs).
--   - Ajoute colonnes Apollo sur public.companies (organization_id, raw_data,
--     enriched_at + champs structurés employees/revenue/parent/founded_year).
--   - Seed 2 app_settings : apollo_api_key (vide) + apollo_enabled (false).
--
-- Doctrine V1 : enrichissement ORGANIZATION seule (1 crédit Apollo par hit).
-- Pas de people enrichment (V2). La clé API est stockée en clair dans
-- app_settings.value (Supabase chiffre au repos via pgcrypto/AES disque).

alter type public.sync_target add value if not exists 'apollo';

alter table public.companies
  add column if not exists apollo_organization_id text unique,
  add column if not exists apollo_enriched_at timestamptz,
  add column if not exists apollo_raw_data jsonb,
  add column if not exists employee_count integer,
  add column if not exists estimated_revenue_eur bigint,
  add column if not exists parent_company text,
  add column if not exists founded_year integer;

create index if not exists companies_apollo_org_id_idx
  on public.companies (apollo_organization_id)
  where apollo_organization_id is not null;

comment on column public.companies.apollo_organization_id is
  'P5.x.Apollo — id Apollo.io de la société (unique).';
comment on column public.companies.apollo_raw_data is
  'P5.x.Apollo — réponse brute Apollo /organizations/enrich (jsonb, archive).';
comment on column public.companies.apollo_enriched_at is
  'P5.x.Apollo — timestamp du dernier enrichissement Apollo.';

insert into public.app_settings (key, value, description, category, updated_at) values
  ('apollo_api_key',
   '""'::jsonb,
   'Clé API Apollo.io (super_admin only). Vide = feature désactivée. Récupérable sur app.apollo.io > Settings > Integrations > API.',
   'integrations',
   now()),
  ('apollo_enabled',
   'false'::jsonb,
   'Toggle global d''activation de l''enrichissement Apollo dans le Smart Add.',
   'integrations',
   now())
on conflict (key) do nothing;
