-- Migration 0064 — P9.1-natif-bis : enrichissement formulaire widget visiteur.
--
-- Le formulaire P9.1-natif capturait `visitor_name` (1 champ) + email +
-- phone (optionnel) + message. Phil veut maintenant capturer des leads
-- mieux qualifies : prenom/nom separes, societe (+ URL), telephone
-- obligatoire — pour eviter un Apollo enrichment automatique on capture
-- proprement a la source.
--
--   - rename `visitor_name` -> `visitor_last_name` (lecture explicite)
--   - +visitor_first_name (text)
--   - +visitor_company (text)
--   - +visitor_company_url (text)
--
-- Pas de NOT NULL : retro-compat des rows existantes (P9.1-natif a deja
-- ~0 row en prod a date, mais on est defensif). L'obligation cote
-- nouveau formulaire est geree par le schema Zod cote server action.

alter table public.visitor_messages
  rename column visitor_name to visitor_last_name;

alter table public.visitor_messages
  add column if not exists visitor_first_name text,
  add column if not exists visitor_company text,
  add column if not exists visitor_company_url text;

comment on column public.visitor_messages.visitor_first_name is
  'P9.1-natif-bis — prenom du visiteur (separe pour clarte CRM).';
comment on column public.visitor_messages.visitor_last_name is
  'P9.1-natif-bis — nom de famille du visiteur (anciennement visitor_name).';
comment on column public.visitor_messages.visitor_company is
  'P9.1-natif-bis — nom de la societe du visiteur (champ requis cote widget).';
comment on column public.visitor_messages.visitor_company_url is
  'P9.1-natif-bis — URL du site societe (optionnel, sert a la dedup company par domaine).';
