-- Migration 0059 — P5.x.1-bis : ajout colonne `language` à public.users
--
-- Langue préférée du user. Utilisée pour :
--   - l'email d'invitation (template Resend FR ou EN)
--   - les futures notifications email (P5.x.2+)
--   - la pré-sélection langue de l'UI admin si on multilingualise (V2)

alter table public.users
  add column if not exists language text not null default 'fr'
  check (language in ('fr', 'en'));

comment on column public.users.language is
  'P5.x.1-bis — langue préférée du user : fr | en. Utilisée pour emails et future UI multilingue.';
