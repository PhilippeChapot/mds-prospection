-- Migration 0040 — P6.x.1a
-- Couche éditoriale par-dessus les produits Sellsy.
--
-- Doctrine : Sellsy = source de vérité (prix, nom, référence) via la table
-- miroir `sellsy_products_mirror` (synchro cron quotidien). Cette table
-- `tariff_editorial` ajoute des métadonnées éditoriales (catégorie, ordre,
-- featured, titre/tagline/description marketing, etc.) liées au sellsy_item_id.
--
-- Une ligne `tariff_editorial` par sellsy_item_id (UNIQUE). Si pas de ligne →
-- produit considéré comme `category='autre'` implicite côté UI.
--
-- Consumer présent : /admin/tarifs (P6.x.1a — éditeur in-place pour Phil).
-- Consumer futur : module "Commande complémentaire Espace Exposant"
-- (P6.x.1b) qui lira `is_visible_public = true`.

create table if not exists public.tariff_editorial (
  id uuid primary key default gen_random_uuid(),
  -- FK vers la table miroir Sellsy. Si l'item Sellsy disparaît, on cascade
  -- la suppression (orphans inutiles). Le miroir est garde-fou : on ne peut
  -- pas tagger un sellsy_item_id qui n'existe pas en local.
  sellsy_product_id bigint not null unique
    references public.sellsy_products_mirror(sellsy_item_id) on delete cascade,
  category text not null check (category in ('pack','sponsor','option','service','autre')),
  sub_category text,
  display_order int not null default 9999,
  featured boolean not null default false,
  editorial_title text,
  tagline text,
  description_md text,
  image_url text,
  tags text[] not null default '{}',
  target_audience text,
  value_proposition text,
  is_visible_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tariff_editorial_category_idx
  on public.tariff_editorial (category);
create index if not exists tariff_editorial_display_order_idx
  on public.tariff_editorial (display_order);
create index if not exists tariff_editorial_featured_idx
  on public.tariff_editorial (featured) where featured = true;
create index if not exists tariff_editorial_visible_public_idx
  on public.tariff_editorial (is_visible_public) where is_visible_public = true;

comment on table public.tariff_editorial is
  'P6.x.1a — couche éditoriale (catégorie, ordre, contenu marketing) par dessus sellsy_products_mirror. 1 ligne max par sellsy_item_id.';
comment on column public.tariff_editorial.category is
  'enum strict : pack | sponsor | option | service | autre. NULL impossible.';
comment on column public.tariff_editorial.sub_category is
  'texte libre indicatif (ex: standard, prs, or, argent, m2, wifi). Pas de CHECK pour rester souple.';
comment on column public.tariff_editorial.is_visible_public is
  'Si false, masque du futur signup wizard / commande complémentaire. Reste visible côté admin.';

-- RLS : par défaut bloquée pour les utilisateurs anon/authenticated.
-- Le client service-role bypass RLS, donc les actions admin (qui passent par
-- getSupabaseServiceClient) lisent/écrivent normalement.
-- On ajoute une policy SELECT public pour l'avenir (P6.x.1b lira en SSR via
-- le client serveur authentifié, autorisé seulement aux rows visibles).
alter table public.tariff_editorial enable row level security;

drop policy if exists "tariff_editorial_read_visible_public" on public.tariff_editorial;
create policy "tariff_editorial_read_visible_public"
  on public.tariff_editorial
  for select
  to anon, authenticated
  using (is_visible_public = true);
