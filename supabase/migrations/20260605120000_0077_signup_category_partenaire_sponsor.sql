-- Migration 0077 — P11.x.Sponsor-Rename
--
-- Contexte : le rebrand P11.x (commit d2cec8e) a fait un sed brutal
-- s/exposant/partenaire/g qui a, entre autres, ecrase l enum applicatif
-- SIGNUP_CATEGORIES en ['partenaire', 'partenaire'] (collision). Ce sed
-- ne touchait PAS la DB (CHECK constraint sur public_signup_attempts
-- accepte toujours 'exposant' | 'partenaire' jusqu a cette migration).
--
-- Nouvelle semantique signups.category :
--   - 'partenaire' = inscription stand physique (ex-Exposant)
--   - 'sponsor'    = inscription support marque sans stand (ex-Partenaire)
--
-- Remap des rows existantes (valide par Phil 2026-06-05, 0 row signup
-- post-rebrand) :
--   'exposant'   (pre-rebrand stand)       -> 'partenaire'
--   'partenaire' (pre-rebrand sponsor/marque) -> 'sponsor'
--
-- Le remap utilise un seul UPDATE avec CASE pour eviter le bug
-- exposant -> partenaire -> sponsor (un UPDATE en deux passes ferait
-- repasser les rows par 'partenaire' apres l etape 1).

-- 1) Drop l ancien CHECK (le nom est genere implicitement par Postgres
--    depuis la migration 0019 : public_signup_attempts_category_check).
alter table public.public_signup_attempts
  drop constraint if exists public_signup_attempts_category_check;

-- 2) Remap atomique CASE des rows existantes.
update public.public_signup_attempts
set category = case category
  when 'exposant' then 'partenaire'
  when 'partenaire' then 'sponsor'
  else category
end
where category in ('exposant', 'partenaire');

-- 3) Nouveau CHECK : on accepte ('partenaire', 'sponsor') + NULL (rows
--    historiques sans intention declaree).
alter table public.public_signup_attempts
  add constraint public_signup_attempts_category_check
  check (category is null or category in ('partenaire', 'sponsor'));

-- 4) Comment a jour.
comment on column public.public_signup_attempts.category is
  'Categorie declaree a l etape 1 (partenaire = stand physique | sponsor = support marque sans stand). Distincte de derived_category (tarif calcule).';

-- GRANT inchange (la table est deja exposee aux roles dans 0006/0019).
