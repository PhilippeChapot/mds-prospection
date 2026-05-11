-- Migration 0036 — P5.x.12
-- Upload logo societe par l'exposant via Espace Exposant + colonne
-- de tracabilite source (manuel / sync Connectonair V1.3).
--
-- Bucket Supabase Storage 'company-logos' :
--   - public = true (read public, les logos s'affichent sur les pages
--     publiques + sur le badge social genere via next/og)
--   - write : pas de policy publique. L'upload passe par la server
--     action `uploadCompanyLogoAction` qui utilise la service-role
--     (bypass RLS) + verifie la session espace exposant + l'ownership
--     prospect->company avant d'autoriser l'upload.
--
-- Pas de bucket policies write/delete complexes ici : tout passe par
-- le code applicatif. La service-role + l'auth en amont garantissent
-- l'isolation.

-- Enum source du logo
do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_logo_source') then
    create type public.company_logo_source as enum ('manual_upload', 'connectonair_sync');
  end if;
end$$;

-- Colonnes logo sur companies
alter table public.companies
  add column if not exists logo_url text,
  add column if not exists logo_source public.company_logo_source,
  add column if not exists logo_uploaded_at timestamptz,
  add column if not exists logo_uploaded_by uuid references public.users(id) on delete set null;

comment on column public.companies.logo_url is
  'URL publique du logo societe (Supabase Storage company-logos/ pour upload manuel ou URL externe pour sync Connectonair).';
comment on column public.companies.logo_source is
  'Source : manual_upload (exposant via Espace Exposant) ou connectonair_sync (cron API V1.3).';
comment on column public.companies.logo_uploaded_at is
  'Timestamp de l''upload / sync. Sert au cron V1.3 pour eviter d''ecraser un upload manuel recent.';

-- Bucket storage company-logos.
-- Public read (UI publique + badge generator next/og fetch).
-- Pas d'INSERT policies cote storage.objects : la service-role bypass.
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;
