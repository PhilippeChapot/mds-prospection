-- ============================================================================
-- 0026 — P4 M5 : refonte sellsy_products_mirror.
--
-- La table cree en 0008 avec sellsy_product_id (text) + sku + name_fr/en n'a
-- jamais ete peuplee (sync M5 pas encore implementee a l'epoque). On la
-- DROP/CREATE avec le schema definitif aligne sur la shape Sellsy V2 :
--   - sellsy_item_id (bigint) comme PK (cf. lib/sellsy/products-mapping.ts)
--   - reference (= sellsy_sku MDS-*) avec UNIQUE + index
--   - price_excl_tax numeric(12,2) (Sellsy retourne string en V2, on parse)
--   - tax_id, unit_id, category_id : FK Sellsy non resolus (on stocke le
--     numeric, charge a l'admin de mapper si besoin)
--   - is_archived boolean : Sellsy peut "archiver" un item plutot que le
--     supprimer ; on le reflete pour le filtrage cote /admin/sellsy-products
--   - synced_at : timestamp de la derniere fois ou cet item a ete confirme
--     present dans le catalogue Sellsy (utile pour detecter les items
--     supprimes / archives entre 2 syncs)
--
-- Synchronise via :
--   - cron Vercel quotidien 6h UTC (/api/cron/sync-sellsy-products)
--   - bouton manuel /admin/sellsy-products (POST /api/admin/sync-sellsy-products)
--
-- L'auto-mapping populate aussi pricing_tiers.sellsy_item_id et
-- addon_options.sellsy_item_id par matching sellsy_sku <-> Sellsy reference.
-- ============================================================================

-- DROP CASCADE supprime la policy "sellsy_products_mirror_admin" definie en
-- 0015 ainsi que tout index. La table n'est pas peuplee, pas de FK entrante.
drop table if exists public.sellsy_products_mirror cascade;

create table public.sellsy_products_mirror (
  sellsy_item_id bigint primary key,
  reference text unique not null,
  name text,
  description text,
  price_excl_tax numeric(12, 2),
  tax_id bigint,
  unit_id bigint,
  category_id bigint,
  is_archived boolean not null default false,
  synced_at timestamptz not null default now()
);

create index sellsy_products_mirror_reference_idx
  on public.sellsy_products_mirror(reference);
create index sellsy_products_mirror_synced_at_idx
  on public.sellsy_products_mirror(synced_at desc);

comment on table public.sellsy_products_mirror is
  'Mirror local des produits Sellsy (catalogue MDS-*). Synchronise via cron quotidien et bouton manuel admin. Source de verite pour les prix : Sellsy (autoritaire). DB pricing_tiers/addon_options : copie pour parcours public, alertee si divergence.';

-- RLS : meme policy permissive que l'originale (admin/sales pour tout).
-- Les ecritures passent par le service-role via les endpoints sync, mais
-- l'admin doit pouvoir lire le mirror cote /admin/sellsy-products.
alter table public.sellsy_products_mirror enable row level security;

create policy "sellsy_products_mirror_admin"
  on public.sellsy_products_mirror for all
  to authenticated
  using (public.is_admin_or_sales())
  with check (public.is_admin_or_sales());
