-- Migration 0009 — affiliates + affiliate_clicks
-- + ALTER prospects et public_signup_attempts pour ajouter le FK affiliate_id

-- ========================================================================== --
-- affiliates : apporteurs d'affaires (SPEC §3.13)
-- ========================================================================== --
create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  display_name_normalized text not null,
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_phone text,
  company_id uuid references public.companies(id) on delete set null,
  token text not null unique,
  commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
  notes_internal text,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affiliates_active_idx on public.affiliates (is_active) where is_active = true;
create index affiliates_company_idx on public.affiliates (company_id) where company_id is not null;

comment on table public.affiliates is 'Apporteurs d''affaires (token court pour lien d''affiliation)';

-- ========================================================================== --
-- affiliate_clicks : tracking des clics (SPEC §3.13)
-- ========================================================================== --
create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  ip_address inet,
  user_agent text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  resulted_in_signup_id uuid references public.public_signup_attempts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index affiliate_clicks_affiliate_idx on public.affiliate_clicks (affiliate_id, created_at desc);
create index affiliate_clicks_signup_idx on public.affiliate_clicks (resulted_in_signup_id) where resulted_in_signup_id is not null;

comment on table public.affiliate_clicks is 'Tracking des clics sur liens d''affiliation';

-- ========================================================================== --
-- FK differes : prospects.affiliate_id et public_signup_attempts.affiliate_id
-- (la table affiliates n'existait pas a la creation des deux tables)
-- ========================================================================== --
alter table public.prospects
  add constraint prospects_affiliate_fk
  foreign key (affiliate_id) references public.affiliates(id) on delete set null;

alter table public.public_signup_attempts
  add constraint signup_attempts_affiliate_fk
  foreign key (affiliate_id) references public.affiliates(id) on delete set null;

create index prospects_affiliate_idx on public.prospects (affiliate_id) where affiliate_id is not null;
create index signup_attempts_affiliate_idx on public.public_signup_attempts (affiliate_id) where affiliate_id is not null;
