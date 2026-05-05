-- ============================================================================
-- 0025 — P4 M3 finitions : ajout sellsy_marseille_item_id sur pricing_tiers.
--
-- Stocke l'item Sellsy qui represente le supplement Marseille (item separe
-- du pack Paris dans le catalogue). Quand le prospect coche Marseille en
-- plus de Paris, on emet une row Sellsy distincte avec ce item_id —
-- meilleure tracabilite cote comptabilite vs le merge dans le prix pack
-- qui faisait perdre la ligne dediee dans le devis.
--
-- Si null, le module create-document log un warning et n'emet PAS la row
-- Marseille (le supplement ne sera pas facture). C'est un cas "config
-- manquante" qui doit etre fixe par l'admin via UPDATE SQL une fois le
-- mapping connu.
-- ============================================================================

alter table public.pricing_tiers
  add column if not exists sellsy_marseille_item_id bigint;

create index if not exists pricing_tiers_sellsy_marseille_item_id_idx
  on public.pricing_tiers(sellsy_marseille_item_id)
  where sellsy_marseille_item_id is not null;

comment on column public.pricing_tiers.sellsy_marseille_item_id is
  'Sellsy item_id du SKU MDS-OPT-*-MARSEILLE (supplement Marseille). Utilise pour generer une row distincte dans le devis Sellsy quand le prospect a choisi Marseille en plus de Paris.';
