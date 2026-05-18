-- Migration 0047 — P6.x.2a-bis
-- Renumérotation des stands Le Nôtre selon le plan Canva officiel :
--   - Grille 8 rangées (A-H) × 11 colonnes (0-10) = 88 cellules max
--   - Pôle pré-assigné par zone (cf. zones Canva)
--   - Tailles : rangée A + colonne 10 → 6 m² ; reste → 9 m²
--
-- Préservation : les stands déjà assignés à un prospect (prospect_id IS NOT
-- NULL) sont CONSERVÉS avec leur ancien numéro L0X. Ils coexisteront dans
-- la grille jusqu'à ce que l'admin les réassigne via l'UI vers un nouveau
-- numéro AX. Pour V1 du seed renumérotation, c'est OK : impact business
-- nul puisqu'à ce stade aucun prospect n'a encore de stand assigné en prod.
--
-- Bloqués (scènes/allées) : non posés ici — Phil ajustera via l'UI après
-- inspection visuelle de la grille (Sheet drawer → Bloquer).

begin;

-- 1. Wipe stands Le Nôtre libres et bloqués sans prospect.
delete from public.stands
where salle = 'le_notre' and prospect_id is null;

-- 2. Insert 88 stands A0..H10 avec pôle + taille selon zones.
--    ON CONFLICT DO NOTHING pour idempotence (re-run safe) et défense contre
--    une éventuelle collision si un prospect avait un stand nommé A0..H10.
insert into public.stands (number, salle, taille_m2, pole_recommended, status)
select
  letter || col_str::text,
  'le_notre',
  case when letter = 'A' or col = 10 then 6.0 else 9.0 end,
  case
    when col = 10 and letter in ('A','B','C','D') then 'DATA_ADTECH'
    when col = 10 then 'OUTDOOR_DOOH'  -- col=10 et letter in (E,F,G,H)
    when letter in ('A','B','C','D') then 'AUDIO_RADIO'
    when letter in ('E','F') then 'DIFFUSION_INFRA'
    else 'VIDEO_CTV'  -- G, H
  end,
  'libre'
from (
  select unnest(array['A','B','C','D','E','F','G','H']) as letter
) letters
cross join (
  select generate_series(0, 10) as col
) cols
cross join lateral (select col::text as col_str) c
on conflict (salle, number) do nothing;

commit;

comment on table public.stands is
  'P6.x.2a-bis — Catalogue stands Le Nôtre (grille 8×11 = 88 cellules). Pôle pré-assigné par zone selon plan Canva officiel.';
