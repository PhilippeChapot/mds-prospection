-- Migration 0008 — exhibitor_sessions + exhibitor_resources + company_profiles + sellsy_products_mirror

-- ========================================================================== --
-- exhibitor_sessions : magic-link Espace Exposant (SPEC §3.11 + §9.3)
-- ========================================================================== --
create table public.exhibitor_sessions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  sent_to_email text not null,
  sent_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now()
);

create unique index exhibitor_sessions_token_unique on public.exhibitor_sessions (token);
create index exhibitor_sessions_contact_idx on public.exhibitor_sessions (contact_id);
create index exhibitor_sessions_pending_idx on public.exhibitor_sessions (used_at, expires_at) where used_at is null;

comment on table public.exhibitor_sessions is 'Sessions magic-link Espace Exposant (TTL 24h, session 30j post-usage)';

-- ========================================================================== --
-- exhibitor_resources : guide exposant editable (SPEC §3.11)
-- ========================================================================== --
create table public.exhibitor_resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_fr text not null,
  title_en text not null,
  body_fr text,
  body_en text,
  is_published boolean not null default false,
  display_order int not null default 0,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index exhibitor_resources_published_idx on public.exhibitor_resources (display_order) where is_published = true;

comment on table public.exhibitor_resources is 'Pages Markdown editables (guide_exposant, infos_pratiques, logistique...)';

-- ========================================================================== --
-- company_profiles : profil enrichi exposant (SPEC §3.14)
-- ========================================================================== --
create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  logo_url text,
  description_fr text,
  description_en text,
  tagline_fr text,
  tagline_en text,
  linkedin_url text,
  website text,
  social_networks jsonb not null default '[]'::jsonb,
  keywords text[] not null default '{}',
  public_contacts jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  completion_status public.lifecycle_completion_status not null default 'empty',
  last_updated_by public.last_updated_by,
  updated_at timestamptz not null default now()
);

comment on table public.company_profiles is 'Profil expose dans le carnet partenaire (logo, description, reseaux)';

-- ========================================================================== --
-- sellsy_products_mirror : miroir local du catalogue Sellsy (SPEC §8.1bis)
-- ========================================================================== --
create table public.sellsy_products_mirror (
  sellsy_product_id text primary key,
  sku text,
  internal_ref text,
  name_fr text,
  name_en text,
  unit_price_eur_ht numeric(12,2),
  vat_rate_percent numeric(5,2),
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now()
);

create index sellsy_products_sku_idx on public.sellsy_products_mirror (sku) where sku is not null;
create index sellsy_products_internal_ref_idx on public.sellsy_products_mirror (internal_ref) where internal_ref is not null;

comment on table public.sellsy_products_mirror is 'Miroir local du catalogue produits Sellsy (sync quotidienne + bouton manuel)';
