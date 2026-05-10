-- Migration 0032 — P5.x.3 S3
-- Stocke l'ID Stripe (`plink_xxx`) du Payment Link acompte en plus de
-- son URL publique. Necessaire pour que le cron cleanup-payment-links
-- puisse appeler `stripe.paymentLinks.update(id, { active: false })` —
-- Stripe attend le `plink_xxx`, pas le slug `https://buy.stripe.com/<slug>`
-- qui n'est pas un identifiant API utilisable.

alter table public.prospects
  add column if not exists acompte_payment_link_id text;

comment on column public.prospects.acompte_payment_link_id is
  'ID Stripe Payment Link (format plink_xxx). Utilise par le cron P5.x.3 cleanup-payment-links pour deactiver les liens expires.';
