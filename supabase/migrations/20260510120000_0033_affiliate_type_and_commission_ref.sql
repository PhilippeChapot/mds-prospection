-- Migration 0033 — P5.x.7
-- Distinction UX media/referral pour les affilies + traçabilité du virement
-- de paiement de commission cote prospects.
--
-- - affiliates.type : 'media' (regie/site partenaire) | 'referral' (ancien
--   exposant qui parraine). Pas d'impact metier (calc commission identique),
--   sert uniquement au filtrage / segmentation cote dashboard admin.
-- - prospects.commission_payment_reference : numero de virement bancaire ou
--   reference custom saisie par Phil quand il marque la commission payee.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'affiliate_type') then
    create type public.affiliate_type as enum ('media', 'referral');
  end if;
end$$;

alter table public.affiliates
  add column if not exists type public.affiliate_type not null default 'media';

comment on column public.affiliates.type is
  'Profil affilie : media (regie/site partenaire) ou referral (ancien exposant parrain). Sert au filtrage/segmentation admin uniquement, pas d''impact sur le calc commission.';

alter table public.prospects
  add column if not exists commission_payment_reference text;

comment on column public.prospects.commission_payment_reference is
  'Reference de paiement (numero de virement, etc.) saisie par l''admin quand markCommissionPaid est appele. Audit trail uniquement.';
