-- Migration 0041 — P6.x.1b
-- Commandes complémentaires depuis l'Espace Exposant.
--
-- Un exposant qui a signé son devis (prospects.signed_at NOT NULL ET status
-- in 'signe' | 'acompte_paye' | 'paye_integral') peut ajouter des produits
-- (options, sponsorings, services — PAS de packs) via cart + Stripe Checkout.
--
-- Doctrine :
--   - Items = JSONB snapshot (prix figé au moment de la commande, immutable
--     même si Sellsy change ensuite)
--   - status = pending → paid → (failed | expired | refunded)
--   - Facture Sellsy générée a posteriori (status=paid) pour conformité
--     compta FR. Stockée dans sellsy_facture_id + sellsy_facture_number.
--   - Pas de RLS public : reads passent par service-role + filtre explicite
--     prospect_id côté server (cohérent espace-exposant).

create table if not exists public.supplementary_orders (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null
    references public.prospects(id) on delete cascade,
  -- JSONB items : [{ sellsy_product_id, reference, name, unit_price_ht, qty, line_total_ht }]
  items jsonb not null,
  total_ht_eur numeric(10, 2) not null,
  total_ttc_eur numeric(10, 2) not null,
  vat_rate numeric(5, 2) not null default 20.00,
  -- Stripe
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  paid_at timestamptz,
  -- Sellsy facture (créée a posteriori, en β)
  sellsy_facture_id bigint,
  sellsy_facture_number text,
  customer_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplementary_orders_prospect_idx
  on public.supplementary_orders (prospect_id, created_at desc);
create index if not exists supplementary_orders_status_idx
  on public.supplementary_orders (status, created_at desc);
create index if not exists supplementary_orders_stripe_session_idx
  on public.supplementary_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on table public.supplementary_orders is
  'P6.x.1b — commandes complémentaires (options/sponsors/services) depuis l''Espace Exposant. Cart → Stripe → facture Sellsy a posteriori.';
comment on column public.supplementary_orders.items is
  'JSONB snapshot des items achetés : prix figé au moment de la commande pour éviter divergence si Sellsy change ensuite.';
comment on column public.supplementary_orders.status is
  'pending → paid → (failed | expired | refunded). Webhook Stripe met à jour.';

-- RLS : write par service-role uniquement. Les reads des exposants passent
-- par les server actions (qui utilisent service-role + filtre explicite par
-- prospect_id résolu via le cookie session). Pas de policy SELECT pour
-- anon/authenticated — cohérent avec le reste de l'espace-exposant.
alter table public.supplementary_orders enable row level security;
