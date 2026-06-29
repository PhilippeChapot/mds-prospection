-- Migration 0112 — Correction taille stands 6m² → 9m²
--
-- Stands concernés : B0, C0, D0, E0, F0, G0 (col-0 latéraux)
--                    A1, A2, A6, A7, A8, A9, A10 (rangée A)
--
-- Raison : erreur de saisie lors du seeding initial (migration 0048).
-- Ces stands mesurent physiquement 9m² — la valeur 6m² était incorrecte.
--
-- Garde-fou : AND taille_m2 = 6 — n'écrase pas si déjà corrigé manuellement.
-- Stands intentionnellement à 6m² (E9, E10, H2, H3, H4) : exclus de la liste.

update public.stands
set
  taille_m2  = 9,
  updated_at = now()
where salle = 'le_notre'
  and taille_m2 = 6
  and number in (
    'B0', 'C0', 'D0', 'E0', 'F0', 'G0',
    'A1', 'A2', 'A6', 'A7', 'A8', 'A9', 'A10'
  );

-- Post-check : doit retourner 13 lignes à 9m².
-- select number, taille_m2 from public.stands
-- where salle = 'le_notre'
--   and number in ('B0','C0','D0','E0','F0','G0','A1','A2','A6','A7','A8','A9','A10')
-- order by number;
