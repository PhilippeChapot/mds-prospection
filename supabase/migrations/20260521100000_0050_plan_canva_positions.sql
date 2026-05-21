-- Migration 0050 — P6.x.3 (Plan Canva interactif)
--
-- 1. companies.public_visibility (BOOLEAN, DEFAULT TRUE)
--    Affichage du nom de l'entreprise voisine sur le plan exposant
--    (RGPD : si FALSE -> seul "Stand X · {status}" est rendu). Default
--    TRUE pour retrocompat -- les entreprises existantes restent visibles.
--
-- 2. Backfill stands.position_x/y/w/h pour les 69 stands Le Notre
--    actuellement NULL. Calcul depuis le numero (lettre A-H + colonne
--    0-10) avec marges pour scenes/allees. Les % cibles sont
--    intentionnellement approximatifs : Phil ajustera quelques stands
--    clefs via les inputs admin (P6.x.3 phase 3).
--
-- Coordonnees : 100 = largeur/hauteur totale du plan Canva.
-- Marges visuelles : 22% gauche (scenes), 3% droite, 12% haut, 8% bas.

alter table public.companies
  add column if not exists public_visibility boolean not null default true;

comment on column public.companies.public_visibility is
  'P6.x.3 — Affichage du nom voisin sur le plan exposant. TRUE = nom visible, FALSE = anonymise (seul status affiche). Default TRUE pour retrocompat.';

-- Backfill positions des stands existants (UPDATE conditionnel : seuls
-- les stands sans position calculee recoivent une valeur).
-- Variables (en %) :
--   margin_left = 22, margin_right = 3, margin_top = 12, margin_bottom = 8
--   cell_w = (100 - 22 - 3) / 11 = 6.818...
--   cell_h = (100 - 12 - 8) / 8 = 10.0
--   Col 0 = droite du plan, col 10 = gauche
--   row_index : A=0, B=1, ..., H=7
update public.stands
set
  position_x = 22 + (10 - (substr(number, 2)::int)) * (75.0 / 11),
  position_y = 12 + (ascii(substr(number, 1, 1)) - ascii('A')) * 10.0,
  position_w = (75.0 / 11) * 0.85,
  position_h = 10.0 * 0.85
where salle = 'le_notre'
  and number ~ '^[A-H][0-9]+$'
  and position_x is null;
