-- Migration 0045 — P6.x.5-ter
-- Remise par ligne au lieu de remise globale dans le Devis Builder.
--
-- Doctrine business : certains items doivent rester au prix plein (PREMIUM,
-- packs ACCESS sans négo, etc.). La remise globale promo_pct était trop
-- grossière. On porte la remise au niveau de chaque item du JSONB
-- quote_items via le champ `discount_pct` (0-100, default 0).
--
-- Étapes :
--   1) Redistribue l'ancien promo_pct global sur chaque item du JSONB,
--      en respectant promo_excludes_premium (PREMIUM reste à 0%).
--   2) Pour les prospects où aucun promo_pct n'avait été posé, on initialise
--      discount_pct=0 sur chaque item (uniformisation du schema JSONB).
--   3) Drop les colonnes top-level devenues obsolètes : promo_pct +
--      promo_excludes_premium. On garde promo_reason (devient "Note
--      interne / Justification du devis", transmise en intro Sellsy).

-- 1. Redistribution de l'ancien promo_pct sur les items, gate PREMIUM.
update public.prospects p
set quote_items = sub.new_items
from (
  select
    p2.id,
    jsonb_agg(
      item || jsonb_build_object(
        'discount_pct',
        case
          when coalesce((item->>'is_premium')::boolean, false) and p2.promo_excludes_premium then 0
          else p2.promo_pct
        end
      )
    ) as new_items
  from public.prospects p2
  cross join lateral jsonb_array_elements(p2.quote_items) as item
  where jsonb_typeof(p2.quote_items) = 'array'
    and jsonb_array_length(p2.quote_items) > 0
    and p2.promo_pct > 0
  group by p2.id
) sub
where p.id = sub.id;

-- 2. Init discount_pct=0 pour les items où il n'existe pas encore (cas
--    promo_pct=0 ou items sans gate).
update public.prospects p
set quote_items = sub.new_items
from (
  select
    p2.id,
    jsonb_agg(
      case
        when item ? 'discount_pct' then item
        else item || jsonb_build_object('discount_pct', 0)
      end
    ) as new_items
  from public.prospects p2
  cross join lateral jsonb_array_elements(p2.quote_items) as item
  where jsonb_typeof(p2.quote_items) = 'array'
    and jsonb_array_length(p2.quote_items) > 0
  group by p2.id
) sub
where p.id = sub.id;

-- 3. Drop les colonnes obsolètes (promo_reason est conservée comme
--    justification globale, transmise à Sellsy en intro du devis).
alter table public.prospects
  drop column if exists promo_pct,
  drop column if exists promo_excludes_premium;

comment on column public.prospects.quote_items is
  'P6.x.5-ter — JSONB array { sellsy_product_id, reference, name, unit_price_ht, qty, category, sub_category, is_premium, discount_pct }. Source de vérité moderne, remplace promo_pct global.';
comment on column public.prospects.promo_reason is
  'P6.x.5-ter — Note interne / Justification du devis, transmise en intro Sellsy.';
