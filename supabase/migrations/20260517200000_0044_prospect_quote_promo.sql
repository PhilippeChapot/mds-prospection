-- Migration 0044 — P6.x.5
-- Devis Builder sur fiche prospect : sélection produits + % promo libre.
--
-- Étend prospects pour stocker le brouillon de devis (quote_items JSONB) +
-- la configuration du tarif préférentiel (promo_pct, promo_reason, gate
-- promo_excludes_premium).
--
-- Source de vérité moderne pour les flows admin (landing form leads, etc.).
-- Les flows legacy signup→devis continuent d'utiliser pack_code +
-- selected_addon_ids + public_signup_attempts.step2_payload (rétrocompat).
--
-- Format quote_items :
--   [{ sellsy_product_id, reference, name, unit_price_ht, qty,
--      category, sub_category, is_premium }]

alter table public.prospects
  add column if not exists quote_items jsonb not null default '[]'::jsonb,
  add column if not exists promo_pct numeric(5,2) not null default 0
    check (promo_pct >= 0 and promo_pct <= 100),
  add column if not exists promo_reason text,
  add column if not exists promo_excludes_premium boolean not null default true;

comment on column public.prospects.quote_items is
  'P6.x.5 — JSONB array des produits sélectionnés pour le devis (source de vérité moderne, remplace pack_code/selected_addon_ids pour les flows admin Quote Builder).';
comment on column public.prospects.promo_pct is
  'P6.x.5 — % de tarif préférentiel libre 0-100 appliqué au moment du devis Sellsy.';
comment on column public.prospects.promo_excludes_premium is
  'P6.x.5 — si true (défaut), les items is_premium ne reçoivent pas la remise (doctrine business : les packs PREMIUM ne sont jamais bradés).';
