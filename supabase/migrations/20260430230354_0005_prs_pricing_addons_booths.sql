-- Migration 0005 — prs_2026_exhibitors + pricing_tiers + addon_options + booth_inventory
-- Toutes ces tables ont un FK season_id (multi-saison cf. SPEC §3.15).

-- ========================================================================== --
-- prs_2026_exhibitors : liste de reference des exposants PRS (47 lignes seedees en P0)
-- ========================================================================== --
create table public.prs_2026_exhibitors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  company_name text not null,
  company_name_normalized text not null,
  matched_company_id uuid references public.companies(id) on delete set null,
  source public.prs_exhibitor_source not null default 'xlsx_seed',
  imported_at timestamptz not null default now()
);

create index prs_exhibitors_season_idx on public.prs_2026_exhibitors (season_id);
create index prs_exhibitors_matched_idx on public.prs_2026_exhibitors (matched_company_id) where matched_company_id is not null;
create unique index prs_exhibitors_season_name_unique on public.prs_2026_exhibitors (season_id, company_name_normalized);

comment on table public.prs_2026_exhibitors is 'Exposants Paris Radio Show 2026 (categorie tarifaire prs_exhibitor)';

-- ========================================================================== --
-- pricing_tiers : 3 packs × 2 categories × N saisons (6 lignes par saison)
-- ========================================================================== --
create table public.pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  pack_code public.pack_code not null,
  category public.category_tarif not null check (category in ('prs_exhibitor', 'standard')),
  price_eur_ht numeric(12,2) not null check (price_eur_ht >= 0),
  description_short_fr text,
  description_short_en text,
  description_full_fr text,
  description_full_en text,
  pole_restrictions uuid[],
  sellsy_sku text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index pricing_tiers_season_pack_cat_unique on public.pricing_tiers (season_id, pack_code, category);
create index pricing_tiers_season_idx on public.pricing_tiers (season_id);

comment on table public.pricing_tiers is 'Tarifs des packs ACCESS/CLASSIC/PREMIUM × categorie standard|prs_exhibitor par saison';

-- ========================================================================== --
-- addon_options : 18 options DDP × N saisons
-- ========================================================================== --
create table public.addon_options (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  code text not null,
  name_fr text not null,
  name_en text not null,
  description_fr text,
  description_en text,
  category public.addon_category not null,
  scope public.addon_scope not null default 'both',
  price_eur_ht numeric(12,2) not null check (price_eur_ht >= 0),
  unit public.attachment_unit not null default 'unit',
  sellsy_sku text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index addon_options_season_code_unique on public.addon_options (season_id, code);
create index addon_options_season_idx on public.addon_options (season_id);
create index addon_options_scope_idx on public.addon_options (scope);

comment on table public.addon_options is 'Options additionnelles des DDP (SPEC §3.5)';

-- ========================================================================== --
-- booth_inventory : emplacements physiques (miroir Canva)
-- ========================================================================== --
create table public.booth_inventory (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  event public.booth_event not null,
  pole_id uuid references public.poles(id) on delete set null,
  room text,
  code text not null,
  label text,
  surface_m2 numeric(6,2),
  pack_code public.pack_code,
  status public.booth_status not null default 'available',
  reserved_for_company_id uuid references public.companies(id) on delete set null,
  option_expires_at timestamptz,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index booth_inventory_season_code_unique on public.booth_inventory (season_id, event, code);
create index booth_inventory_season_idx on public.booth_inventory (season_id);
create index booth_inventory_status_idx on public.booth_inventory (status);
create index booth_inventory_pole_idx on public.booth_inventory (pole_id);
-- Index partiel pour le cron qui releche les options expirees.
create index booth_inventory_option_expiring_idx on public.booth_inventory (option_expires_at) where status = 'option' and option_expires_at is not null;

comment on table public.booth_inventory is 'Emplacements physiques — verrou optimiste 30min sur status=option (SPEC §3.10)';
