-- ============================================================================
-- 0023 — P4 M3 : ajout sellsy_item_id sur pricing_tiers + addon_options.
--
-- Stock de l'id numerique stable Sellsy pour eviter de re-search par
-- reference a chaque devis emis. Cache persistent (vs cache memoire qui
-- se perd entre deploiements).
--
-- Le helper lib/sellsy/products-mapping.ts (P4 M3) lit cette colonne en
-- priorite, fait le lookup Sellsy par sellsy_sku si null, puis UPDATE.
--
-- L'oubli vient de 0022 ou seul le commentaire mentionnait que sellsy_sku
-- suffisait — en realite il faut aussi un cache item_id pour la perf.
-- ============================================================================

alter table public.pricing_tiers
  add column if not exists sellsy_item_id bigint;

alter table public.addon_options
  add column if not exists sellsy_item_id bigint;

create index if not exists pricing_tiers_sellsy_item_idx
  on public.pricing_tiers (sellsy_item_id)
  where sellsy_item_id is not null;

create index if not exists addon_options_sellsy_item_idx
  on public.addon_options (sellsy_item_id)
  where sellsy_item_id is not null;

comment on column public.pricing_tiers.sellsy_item_id is
  'ID numerique Sellsy (cache persistent du lookup par reference). Null = pas encore mappe.';
comment on column public.addon_options.sellsy_item_id is
  'ID numerique Sellsy (cache persistent du lookup par reference). Null = pas encore mappe.';
