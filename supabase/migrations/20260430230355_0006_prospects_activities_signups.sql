-- Migration 0006 — prospects + activities + public_signup_attempts
-- Le FK affiliate_id est ajoute en migration 0009 (apres la creation de la table affiliates).

-- ========================================================================== --
-- prospects : pipeline commercial (cf. SPEC §4.1)
-- ========================================================================== --
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  is_test boolean not null default false,

  -- Snapshots a la creation (versionnement)
  deposit_percentage_at_creation numeric(5,2),
  vat_rate_at_creation numeric(5,2),

  status public.prospect_status not null default 'lead',
  source public.prospect_source not null default 'inscription_web',
  source_detail text,
  events_interest text[] not null default '{}',

  pack_code public.pack_code not null default 'A_DEFINIR',
  selected_booth_id uuid references public.booth_inventory(id) on delete set null,
  selected_addon_ids uuid[] not null default '{}',
  estimated_amount numeric(12,2),

  -- Sortie commerciale (SPEC §3.10)
  payment_path public.payment_path,
  acompte_amount_eur numeric(12,2),
  acompte_status public.acompte_status not null default 'not_required',
  acompte_paid_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  sellsy_devis_id text,
  sellsy_proforma_id text,
  sellsy_invoice_id text,

  -- Affiliation (FK ajoute en 0009)
  affiliate_id uuid,
  commission_eur_ht numeric(12,2),
  commission_status public.commission_status not null default 'not_applicable',
  commission_paid_at timestamptz,

  -- Recap PDF post-signature (SPEC §3.28)
  recap_pdf_url text,
  recap_pdf_generated_at timestamptz,

  -- Suivi
  probability int check (probability is null or (probability between 0 and 100)),
  expected_close_date date,
  notes text,
  owner_id uuid references public.users(id) on delete set null,
  sellsy_opportunity_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index prospects_season_idx on public.prospects (season_id);
create index prospects_company_idx on public.prospects (company_id);
create index prospects_status_idx on public.prospects (status);
create index prospects_owner_idx on public.prospects (owner_id);
create index prospects_acompte_status_idx on public.prospects (acompte_status) where acompte_status <> 'not_required';
-- Index pour exclure les prospects de test des reportings.
create index prospects_real_idx on public.prospects (season_id, status) where is_test = false;

comment on table public.prospects is 'Pipeline commercial — un prospect = (saison, company, contact principal)';

-- ========================================================================== --
-- activities : timeline / audit trail des prospects
-- ========================================================================== --
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  type public.activity_type not null,
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index activities_prospect_idx on public.activities (prospect_id, created_at desc);
create index activities_type_idx on public.activities (type);

comment on table public.activities is 'Timeline d''actions sur un prospect (notes, emails, calls, syncs...)';

-- ========================================================================== --
-- public_signup_attempts : tentatives publiques avant double opt-in
-- ========================================================================== --
create table public.public_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_domain text,
  email_validation_status public.email_validation_status not null,
  company_name_input text,
  matched_company_id uuid references public.companies(id) on delete set null,
  is_new_company boolean not null default false,
  ai_classification jsonb,
  derived_category public.category_tarif not null default 'non_eligible',

  contact_first_name text,
  contact_last_name text,
  contact_role text,
  contact_phone text,

  -- Affiliation (FK ajoute en 0009)
  affiliate_id uuid,
  affiliate_input_raw text,

  language public.language_code not null default 'FR',
  marketing_consent boolean not null default false,
  cgv_accepted_at timestamptz,
  cgv_version int,

  verification_token uuid not null default gen_random_uuid(),
  verification_sent_at timestamptz,
  verified_at timestamptz,

  ip_address inet,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,

  converted_to_prospect_id uuid references public.prospects(id) on delete set null,
  status public.signup_status not null default 'awaiting_verification',
  created_at timestamptz not null default now()
);

create unique index signup_attempts_token_unique on public.public_signup_attempts (verification_token);
create index signup_attempts_email_idx on public.public_signup_attempts (lower(email));
create index signup_attempts_status_idx on public.public_signup_attempts (status);
create index signup_attempts_pending_idx on public.public_signup_attempts (status, created_at) where status = 'awaiting_verification';

comment on table public.public_signup_attempts is 'Tentatives d''inscription publique (avant double opt-in) — SPEC §6';
