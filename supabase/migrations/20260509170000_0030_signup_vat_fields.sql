-- Migration 0030 — P5.x.1
-- Capture du numero de TVA UE intracommunautaire des l'etape 1 du wizard
-- public, pour declencher l'autoliquidation TVA Art. 196 sur les devis
-- Sellsy emis aux clients UE non-FR.
--
-- Ces colonnes sont *temporaires* (lifecycle = duree de vie du signup).
-- A la conversion signup->prospect, les valeurs sont copiees sur la row
-- companies (qui porte les colonnes vat_* deja existantes depuis la
-- migration 0004). Le helper sellsy/create-document.ts lit alors
-- companies.vat_country / companies.vat_verified pour appliquer
-- l'autoliquidation (P4 M7, deja branche).
--
-- companies.vat_verified est de type public.vat_status (enum :
-- unverified | pending | valid | invalid). On reutilise le meme enum
-- ici pour homogeneite.
--
-- Pas d'ALTER sur prospects : les colonnes vat_* vivent sur companies
-- (la TVA appartient a l'entreprise, pas au prospect commercial), donc
-- aucune duplication necessaire cote prospects.

alter table public.public_signup_attempts
  add column if not exists vat_country varchar(2),
  add column if not exists vat_number text,
  add column if not exists vat_verified public.vat_status not null default 'unverified',
  add column if not exists vat_verified_at timestamptz;

comment on column public.public_signup_attempts.vat_country is
  'Code pays ISO 2 lettres (DE, BE, ES, IT, NL, PT, etc.). null si client FR ou hors UE. Source : etape 1 wizard public.';
comment on column public.public_signup_attempts.vat_number is
  'Numero TVA intracommunautaire saisi par le client (sans prefixe pays). null si pas applicable.';
comment on column public.public_signup_attempts.vat_verified is
  'Statut verification VIES (unverified / pending / valid / invalid). Si valid + vat_country UE non-FR, autoliquidation Art. 196 sera appliquee a la conversion.';
comment on column public.public_signup_attempts.vat_verified_at is
  'Timestamp de la derniere verification VIES (success ou failure).';
