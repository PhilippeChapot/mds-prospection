-- Migration 0031 — P5.x.2
-- Persistance de l'URL Payment Link Stripe + date d'expiration sur la
-- row prospects, pour permettre :
--   1. L'affichage du CTA "Regler l'acompte" dans l'Espace Exposant
--      (P5.x.2) sans avoir a re-creer un lien.
--   2. Le cron de cleanup (P4 M5) qui desactive les liens expires en
--      passant active=false sur paymentLinks Stripe.
--
-- Avant cette migration, l'URL n'etait persistee qu'en append dans
-- prospects.notes (audit trail seulement) et envoyee directement par
-- email — non queryable.
--
-- prospects.acompte_paid_at existe deja (migration 0006). Pas besoin de
-- l'ajouter ici.

alter table public.prospects
  add column if not exists acompte_payment_link_url text,
  add column if not exists acompte_payment_link_expires_at timestamptz;

comment on column public.prospects.acompte_payment_link_url is
  'URL Stripe Payment Link pour l''acompte 30%, persistee a la creation auto P4.x.2 D. Affichee dans l''Espace Exposant tant que acompte_paid_at est null.';
comment on column public.prospects.acompte_payment_link_expires_at is
  'Date d''expiration du Payment Link (TTL 30j cote app). Le cron cleanup-payment-links P4 M5 desactive les liens passes cette date via paymentLinks.update active=false.';
