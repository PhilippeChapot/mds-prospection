-- Migration 0048 — P6.x.2a-ter
-- Re-seed exact des stands Salle Le Nôtre selon le plan Canva officiel
-- (capture transmise par Phil le 2026-05-17).
--
-- 69 stands au total, numérotés Lettre+Colonne (A1..H9). Les "trous"
-- (A0, A5, H0, H1, H5..H8, etc.) correspondent aux scènes PRS/MDS,
-- allées centrales et entrées physiques — pas de stand commercialisable,
-- pas besoin de les créer en 'bloque' (la grid UI affichera simplement
-- des cellules vides à ces positions).
--
-- Doctrine couleurs zones (pole_recommended) :
--   - AUDIO_RADIO     : A1-A10, B1-B8, C1-C8, D1-D8 (40 stands)
--   - DIFFUSION_INFRA : E1-E10, F1-F8 (19 stands)
--   - VIDEO_CTV       : G1-G8, H2-H4, H9 (12 stands)
--   - DATA_ADTECH     : B0, C0, D0 (3 stands, col 10 visuel)
--   - OUTDOOR_DOOH    : E0, F0, G0 (3 stands, col 10 visuel)
--
-- position_x / position_y : coordonnées grille CSS (P6.x.3 utilisera ces
-- positions pour l'overlay cliquable sur l'image du plan Canva).
--   position_y = index rangée (A=0, B=1, ..., H=7)
--   position_x = 10 - colonne_visible (col 0 visuel = position_x=10 droite,
--               col 10 visuel = position_x=0 gauche)

begin;

-- 1. Wipe stands Le Nôtre libres et bloqués sans prospect.
--    Les stands déjà assignés à un prospect (B6 et C6 actuellement) sont
--    préservés. Comme leurs numéros existent dans le nouveau seed, le
--    ON CONFLICT DO UPDATE plus bas met à jour leurs métadonnées
--    (taille/pôle/position) sans toucher prospect_id ni status.
delete from public.stands
where salle = 'le_notre' and prospect_id is null;

-- 2. INSERT 69 stands exacts selon le plan Canva.
insert into public.stands (number, salle, taille_m2, pole_recommended, status, position_x, position_y) values
  -- Rangée A (Radio & Audio, 6 m²) — 9 stands, pas de A0 ni A5
  ('A1',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 9, 0),
  ('A2',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 8, 0),
  ('A3',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 7, 0),
  ('A4',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 6, 0),
  ('A6',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 4, 0),
  ('A7',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 3, 0),
  ('A8',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 2, 0),
  ('A9',  'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 1, 0),
  ('A10', 'le_notre', 6.0, 'AUDIO_RADIO', 'libre', 0, 0),
  -- Rangée B (Radio & Audio + Data Adtech sur B0) — 9 stands
  ('B0', 'le_notre', 6.0, 'DATA_ADTECH', 'libre', 10, 1),
  ('B1', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  9, 1),
  ('B2', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  8, 1),
  ('B3', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  7, 1),
  ('B4', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  6, 1),
  ('B5', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  5, 1),
  ('B6', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  4, 1),
  ('B7', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  3, 1),
  ('B8', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  2, 1),
  -- Rangée C (Radio & Audio + Data Adtech sur C0) — 9 stands
  ('C0', 'le_notre', 6.0, 'DATA_ADTECH', 'libre', 10, 2),
  ('C1', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  9, 2),
  ('C2', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  8, 2),
  ('C3', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  7, 2),
  ('C4', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  6, 2),
  ('C5', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  5, 2),
  ('C6', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  4, 2),
  ('C7', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  3, 2),
  ('C8', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  2, 2),
  -- Rangée D (Radio & Audio + Data Adtech sur D0) — 9 stands
  ('D0', 'le_notre', 6.0, 'DATA_ADTECH', 'libre', 10, 3),
  ('D1', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  9, 3),
  ('D2', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  8, 3),
  ('D3', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  7, 3),
  ('D4', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  6, 3),
  ('D5', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  5, 3),
  ('D6', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  4, 3),
  ('D7', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  3, 3),
  ('D8', 'le_notre', 9.0, 'AUDIO_RADIO', 'libre',  2, 3),
  -- Rangée E (Diffusion & Infra + Outdoor sur E0) — 11 stands (E9 + E10 latéraux 6 m²)
  ('E0',  'le_notre', 6.0, 'OUTDOOR_DOOH',    'libre', 10, 4),
  ('E1',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  9, 4),
  ('E2',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  8, 4),
  ('E3',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  7, 4),
  ('E4',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  6, 4),
  ('E5',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  5, 4),
  ('E6',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  4, 4),
  ('E7',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  3, 4),
  ('E8',  'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  2, 4),
  ('E9',  'le_notre', 6.0, 'DIFFUSION_INFRA', 'libre',  1, 4),
  ('E10', 'le_notre', 6.0, 'DIFFUSION_INFRA', 'libre',  0, 4),
  -- Rangée F (Diffusion & Infra + Outdoor sur F0) — 9 stands
  ('F0', 'le_notre', 6.0, 'OUTDOOR_DOOH',    'libre', 10, 5),
  ('F1', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  9, 5),
  ('F2', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  8, 5),
  ('F3', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  7, 5),
  ('F4', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  6, 5),
  ('F5', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  5, 5),
  ('F6', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  4, 5),
  ('F7', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  3, 5),
  ('F8', 'le_notre', 9.0, 'DIFFUSION_INFRA', 'libre',  2, 5),
  -- Rangée G (Vidéo & CTV + Outdoor sur G0) — 9 stands
  ('G0', 'le_notre', 6.0, 'OUTDOOR_DOOH', 'libre', 10, 6),
  ('G1', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  9, 6),
  ('G2', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  8, 6),
  ('G3', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  7, 6),
  ('G4', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  6, 6),
  ('G5', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  5, 6),
  ('G6', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  4, 6),
  ('G7', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  3, 6),
  ('G8', 'le_notre', 9.0, 'VIDEO_CTV',    'libre',  2, 6),
  -- Rangée H (Vidéo & CTV, 4 stands isolés)
  ('H2', 'le_notre', 6.0, 'VIDEO_CTV', 'libre', 8, 7),
  ('H3', 'le_notre', 6.0, 'VIDEO_CTV', 'libre', 7, 7),
  ('H4', 'le_notre', 6.0, 'VIDEO_CTV', 'libre', 6, 7),
  ('H9', 'le_notre', 9.0, 'VIDEO_CTV', 'libre', 1, 7)
on conflict (salle, number) do update set
  -- Met à jour les métadonnées sans toucher prospect_id, status, notes
  -- (préserve les éventuelles assignations en cours, ex. B6 et C6).
  taille_m2 = excluded.taille_m2,
  pole_recommended = excluded.pole_recommended,
  position_x = excluded.position_x,
  position_y = excluded.position_y,
  updated_at = now();

-- 3. Hygiène : si des stands hors-plan existent encore (anciens A0, A5, etc.
--    du seed 0047 d'hier) ET ne sont PAS assignés, on les supprime pour
--    nettoyer la grid finale. Les stands hors-plan ASSIGNÉS sont conservés
--    (Phil pourra les réassigner manuellement vers un numéro valide).
delete from public.stands
where salle = 'le_notre'
  and prospect_id is null
  and number not in (
    'A1','A2','A3','A4','A6','A7','A8','A9','A10',
    'B0','B1','B2','B3','B4','B5','B6','B7','B8',
    'C0','C1','C2','C3','C4','C5','C6','C7','C8',
    'D0','D1','D2','D3','D4','D5','D6','D7','D8',
    'E0','E1','E2','E3','E4','E5','E6','E7','E8','E9','E10',
    'F0','F1','F2','F3','F4','F5','F6','F7','F8',
    'G0','G1','G2','G3','G4','G5','G6','G7','G8',
    'H2','H3','H4','H9'
  );

commit;

comment on table public.stands is
  'P6.x.2a-ter — Catalogue stands Salle Le Nôtre (69 emplacements selon plan Canva officiel 2026). Numérotés Lettre+Colonne (A1..H9). Les "trous" (A0, A5, H0, H1, H5-H8...) correspondent aux scènes/allées physiques.';
