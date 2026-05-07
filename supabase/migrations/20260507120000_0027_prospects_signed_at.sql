-- ============================================================================
-- 0027 — P4 M7 : ajout prospects.signed_at (timestamp signature devis Sellsy).
--
-- Mis a jour par le webhook /api/webhooks/sellsy quand event.type='document.signed'.
-- prospects.acompte_paid_at existe deja (P3) pour le timestamp acompte Stripe ;
-- signed_at est dedie au moment ou le devis Sellsy passe en statut signe
-- (independant du paiement, qui peut suivre).
--
-- Note : la table vat_verifications + colonnes prospects.vat_country/vat_number/
-- vat_verified existent deja (migration 0022 P4 M1), pas de schema a modifier
-- pour le service VIES.
-- ============================================================================

alter table public.prospects
  add column if not exists signed_at timestamptz;

comment on column public.prospects.signed_at is
  'Timestamp de la signature du devis Sellsy (mis a jour par le webhook document.signed). Distinct de acompte_paid_at (paiement Stripe).';
