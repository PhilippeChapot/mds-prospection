-- ============================================================================
-- 0022 — P4 M1 : foundations integrations Sellsy / Stripe / Brevo lifecycle.
--
-- Migration consolidee (au lieu de 4 distinctes) : ALTER existants pour
-- ajouter les indicateurs de sync + tracking erreur, plus la table
-- vat_verifications (cache VIES) + seed app_settings.admin_notification_emails.
--
-- Ce qui existe DEJA et qu'on N'AJOUTE PAS :
--   - prospects.is_test (P0 M3)
--   - prospects.sellsy_opportunity_id, sellsy_devis_id, sellsy_proforma_id,
--     sellsy_invoice_id, payment_path, acompte_status,
--     stripe_checkout_session_id, stripe_payment_intent_id (P0 M3)
--   - companies.sellsy_id, brevo_company_id, vat_number, vat_verified,
--     vat_verified_at (P0 M2)
--   - contacts.sellsy_contact_id, brevo_contact_id (P0 M2)
--   - pricing_tiers.sellsy_sku, addon_options.sellsy_sku (P0 M3)
--   - stripe_events_processed, sellsy_events_processed + RLS (P0 M5/M6)
--   - sellsy_products_mirror (P0 M3 — schema V1 sellsy_product_id text PK,
--     compat V2 via cast item_id::text dans le code)
--   - Helper public.is_admin() SECURITY DEFINER inline (P2 M1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROSPECTS — indicateurs de sync + tracking erreur consolide
-- ----------------------------------------------------------------------------
alter table public.prospects
  add column if not exists last_synced_sellsy_at timestamptz,
  add column if not exists last_synced_brevo_at timestamptz,
  add column if not exists last_synced_stripe_at timestamptz,
  add column if not exists last_sync_error_message text,
  add column if not exists last_sync_error_provider text
    check (last_sync_error_provider is null or last_sync_error_provider in ('sellsy', 'stripe', 'brevo', 'vies')),
  add column if not exists last_sync_error_at timestamptz;

comment on column public.prospects.last_sync_error_message is
  'Message d''erreur de la derniere sync echouee (apres 3 retries exponentielles). NULL si aucun probleme. Affiche dans le badge rouge sur /admin/prospects/[id] au survol.';
comment on column public.prospects.last_sync_error_provider is
  'Provider concerne par la derniere erreur : sellsy / stripe / brevo / vies. NULL si pas d''erreur.';

create index if not exists prospects_sync_error_idx
  on public.prospects (last_sync_error_at desc)
  where last_sync_error_message is not null;

-- ----------------------------------------------------------------------------
-- 2. COMPANIES — indicateurs de sync (brevo_company_id existe deja P0 M2)
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists last_synced_sellsy_at timestamptz,
  add column if not exists last_synced_brevo_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. CONTACTS — indicateurs de sync (sellsy_contact_id + brevo_contact_id
--    existent deja P0 M2)
-- ----------------------------------------------------------------------------
alter table public.contacts
  add column if not exists last_synced_sellsy_at timestamptz,
  add column if not exists last_synced_brevo_at timestamptz;

-- ----------------------------------------------------------------------------
-- 4. PRICING_TIERS + ADDON_OPTIONS — pas de modif. On utilise sellsy_sku TEXT
--    existant (P0 M3) comme cle de matching avec sellsy_products_mirror.sku.
--    Pas besoin d'item_id BIGINT separe : Sellsy V2 retourne item.id qu'on
--    cast en string pour matcher la PK existante sellsy_product_id TEXT.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. SELLSY_PRODUCTS_MIRROR — pas de creation (table existe P0 M3 avec schema
--    V1 : sellsy_product_id TEXT PK / sku / internal_ref / name_fr/en /
--    unit_price_eur_ht / vat_rate_percent / is_active / last_synced_at).
--    On utilise telle quelle. Sync M5 cast item_id::text -> sellsy_product_id.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6. VAT_VERIFICATIONS — cache des verifications VIES (TTL 30j cote app).
--    Cle composite (country, vat_number) = format VIES standard.
-- ----------------------------------------------------------------------------
create table if not exists public.vat_verifications (
  country text not null,
  vat_number text not null,
  is_valid boolean not null,
  trader_name text,
  trader_address text,
  request_date timestamptz not null default now(),
  primary key (country, vat_number)
);

comment on table public.vat_verifications is
  'Cache VIES (verification TVA UE) — TTL 30j cote app. Utilise par lib/vies/verify.ts en P4 M7.';

alter table public.vat_verifications enable row level security;

-- Drop les policies si elles existent deja (idempotent : utile en cas de
-- replay de la migration sur DB ou la table preexistait).
drop policy if exists "vat_verifications_admin_all" on public.vat_verifications;

create policy "vat_verifications_admin_all"
  on public.vat_verifications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. APP_SETTINGS — destinataires des notifications admin (M6).
--    Format : JSON array de strings (emails). Editable via SQL pour P4 ;
--    UI dans /admin/preferences viendra en P5.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value, description, category)
values (
  'admin_notification_emails',
  '["philippe@mediadays.solutions"]'::jsonb,
  'Emails destinataires des notifications admin (signup converti, acompte paye, signature finale, sync error). JSON array de strings.',
  'general'
)
on conflict (key) do nothing;
