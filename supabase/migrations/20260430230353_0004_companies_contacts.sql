-- Migration 0004 — companies + contacts
-- companies est transverse (pas de season_id) ; contacts FK companies.

-- ========================================================================== --
-- companies (SPEC §4.1)
-- ========================================================================== --
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null,
  primary_domain text,
  alternate_domains text[] not null default '{}',
  website text,
  country text,
  description text,
  pole_id uuid references public.poles(id) on delete set null,
  pole_confidence numeric(3,2) check (pole_confidence is null or (pole_confidence >= 0 and pole_confidence <= 1)),
  pole_classified_by public.classification_source,
  pole_classified_at timestamptz,
  category public.category_tarif not null default 'non_eligible',
  was_prs_2026_exhibitor boolean not null default false,
  preferred_room text,
  vat_number text,
  vat_country text,
  vat_verified public.vat_status not null default 'unverified',
  vat_verified_at timestamptz,
  sellsy_id text,
  brevo_company_id text,
  connectonair_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_pole_idx on public.companies (pole_id);
create index companies_category_idx on public.companies (category);
create index companies_sellsy_id_idx on public.companies (sellsy_id) where sellsy_id is not null;

comment on table public.companies is 'Societes transverses (pas de FK saison) — SPEC §4.1';

-- ========================================================================== --
-- contacts
-- ========================================================================== --
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  phone text,
  role text,
  is_primary boolean not null default false,
  email_verified boolean not null default false,
  email_verified_at timestamptz,
  email_deliverability_status public.email_deliverability_status not null default 'unchecked',
  email_deliverability_checked_at timestamptz,
  language public.language_code not null default 'FR',
  marketing_consent boolean not null default false,
  lifecycle_emails_enabled boolean not null default true,
  sellsy_contact_id text,
  brevo_contact_id text,
  created_at timestamptz not null default now()
);

create unique index contacts_email_unique on public.contacts (lower(email));
create index contacts_company_idx on public.contacts (company_id);
create index contacts_primary_idx on public.contacts (company_id, is_primary) where is_primary = true;

comment on table public.contacts is 'Contacts rattaches aux companies — SPEC §4.1';
