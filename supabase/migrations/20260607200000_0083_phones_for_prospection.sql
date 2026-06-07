-- Migration 0083 — P5.x.PhoneEnrichmentDisplay
--
-- Phase 0 audit (2026-06-07) :
--   - companies.phone existe deja (text, ajoute par 0061 P5.x.Apollo-bis).
--     On NE recree PAS de colonne phone_main redondante — on continue
--     d ecrire dans companies.phone.
--   - contacts.phone existe (text, ajoute par 0004) — c est un fixe
--     generique. On ajoute en plus phone_mobile pour distinguer mobile
--     (utile pour le bouton tel: depuis l UI admin sur le terrain).
--
-- Ajouts (idempotent) :
--   - companies.phone_source : qui a renseigne phone ('connectonair' /
--     'master' / 'apollo' / 'manual'). Permet de tracker l origine et
--     prioriser le re-enrichissement.
--   - contacts.phone_mobile + phone_mobile_source : mobile distinct du
--     fixe contact pour les listes admin de prospection.
--
-- Pas d index "telephone" full-text — V1 : juste partial index sur les
-- colonnes pour filtrer rapidement les rows non-enrichies.

alter table public.companies
  add column if not exists phone_source text;

alter table public.contacts
  add column if not exists phone_mobile text,
  add column if not exists phone_mobile_source text;

create index if not exists idx_companies_phone_source
  on public.companies(phone_source)
  where phone_source is not null;

create index if not exists idx_contacts_phone_mobile
  on public.contacts(phone_mobile)
  where phone_mobile is not null;

comment on column public.companies.phone_source is
  'P5.x.PhoneEnrichmentDisplay — source du phone (connectonair/master/apollo/manual). Null = pas de phone ou source inconnue (legacy).';
comment on column public.contacts.phone_mobile is
  'P5.x.PhoneEnrichmentDisplay — mobile contact distinct du fixe (contacts.phone). Format E.164 normalise (+33XXXXXXXXX) recommande.';
comment on column public.contacts.phone_mobile_source is
  'Idem phone_source mais cote contact (connectonair/master/apollo/manual).';

-- GRANT existant suffit (companies + contacts deja exposees au service_role
-- dans les migrations precedentes). Pas besoin de re-grant.
