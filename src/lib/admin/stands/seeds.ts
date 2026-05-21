/**
 * P6.x.2a / P6.x.2a-bis — seed builders pure (testables sans dépendance DB).
 *
 * Importé par scripts/seed-stands.ts (le script d'application) ET par les
 * tests unitaires de structure.
 *
 * V1 (P6.x.2a) : 69 stands L01..L69. Conservé en `buildLeNotreFlatSeeds`
 * pour rétrocompat tests legacy + comparaisons historiques.
 *
 * V2 (P6.x.2a-bis) : grille 8×11 (A-H × 0-10 = 88 cellules), pôle pré-assigné
 * par zone selon le plan Canva, taille différenciée (rangée A et colonne 10
 * en 6 m², le reste en 9 m²).
 */

export type PoleCode =
  | 'REGIES_RETAIL_MEDIA'
  | 'AUDIO_RADIO'
  | 'DIFFUSION_INFRA'
  | 'VIDEO_CTV'
  | 'OUTDOOR_DOOH'
  | 'DATA_ADTECH';

export interface StandSeed {
  number: string;
  salle: 'le_notre';
  taille_m2: number;
  pole_recommended: PoleCode | null;
  status: 'libre';
}

/**
 * Legacy V1 (P6.x.2a) : 69 stands L01..L69 (15 × 6m² + 54 × 9m²).
 * Pas de pôle assigné (cohabitation des 5 pôles MDS Solutions).
 */
export function buildLeNotreFlatSeeds(): StandSeed[] {
  const seeds: StandSeed[] = [];
  for (let i = 1; i <= 15; i++) {
    seeds.push({
      number: `L${String(i).padStart(2, '0')}`,
      salle: 'le_notre',
      taille_m2: 6.0,
      pole_recommended: null,
      status: 'libre',
    });
  }
  for (let i = 16; i <= 69; i++) {
    seeds.push({
      number: `L${String(i).padStart(2, '0')}`,
      salle: 'le_notre',
      taille_m2: 9.0,
      pole_recommended: null,
      status: 'libre',
    });
  }
  return seeds;
}

// Backwards compat alias for the original P6.x.2a test/script.
export const buildLeNotreSeeds = buildLeNotreFlatSeeds;

const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const COL_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * P6.x.2a-bis : grille 8 rangées × 11 colonnes = 88 cellules.
 *
 * Doctrine zones (mappées sur le plan Canva) :
 *   - A, B, C, D → AUDIO_RADIO (zone Radio & Audio)
 *   - E, F → DIFFUSION_INFRA (zone centrale)
 *   - G, H → VIDEO_CTV (zone bas)
 *
 * Override colonne 10 (côté droit du plan) :
 *   - col 10 + A-D → DATA_ADTECH
 *   - col 10 + E-H → OUTDOOR_DOOH
 *
 * Tailles :
 *   - Rangée A + colonne 10 → 6.0 m²
 *   - Reste → 9.0 m²
 */
export function buildLeNotreGridSeeds(): StandSeed[] {
  const seeds: StandSeed[] = [];
  for (const letter of ROW_LETTERS) {
    for (const col of COL_INDICES) {
      seeds.push({
        number: `${letter}${col}`,
        salle: 'le_notre',
        taille_m2: letter === 'A' || col === 10 ? 6.0 : 9.0,
        pole_recommended: zonePoleFor(letter, col),
        status: 'libre',
      });
    }
  }
  return seeds;
}

function zonePoleFor(letter: (typeof ROW_LETTERS)[number], col: number): PoleCode {
  // Override colonne 10
  if (col === 10) {
    if (['A', 'B', 'C', 'D'].includes(letter)) return 'DATA_ADTECH';
    return 'OUTDOOR_DOOH';
  }
  // Défaut par rangée
  if (['A', 'B', 'C', 'D'].includes(letter)) return 'AUDIO_RADIO';
  if (['E', 'F'].includes(letter)) return 'DIFFUSION_INFRA';
  return 'VIDEO_CTV'; // G, H
}

/**
 * P6.x.2a-ter — Source de vérité JS du plan Canva exact (69 stands).
 *
 * Doit rester synchronisée avec la migration 0048_renumber_stands_v2.sql.
 * Sert au testing (assert structure) ET au front pour connaître les
 * "trous" du plan (cellules vides dans la grid 2D = positions où il n'y
 * a pas de stand commercialisable, ex: scènes PRS/MDS, allées).
 */
export interface PlanStandSeed {
  number: string;
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  col: number;
  taille_m2: number;
  pole_recommended: PoleCode;
}

function buildPlanStand(
  letter: PlanStandSeed['letter'],
  col: number,
  taille_m2: number,
  pole: PoleCode,
): PlanStandSeed {
  return { number: `${letter}${col}`, letter, col, taille_m2, pole_recommended: pole };
}

export const LE_NOTRE_PLAN_STANDS: readonly PlanStandSeed[] = [
  // Rangée A (Radio & Audio, 6 m²) — 9 stands, pas de A0 ni A5
  buildPlanStand('A', 1, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 2, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 3, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 4, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 6, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 7, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 8, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 9, 6, 'AUDIO_RADIO'),
  buildPlanStand('A', 10, 6, 'AUDIO_RADIO'),
  // Rangées B/C/D : col 0 = DATA_ADTECH (6m²), cols 1-8 = AUDIO_RADIO (9m²)
  buildPlanStand('B', 0, 6, 'DATA_ADTECH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('B', c, 9, 'AUDIO_RADIO')),
  buildPlanStand('C', 0, 6, 'DATA_ADTECH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('C', c, 9, 'AUDIO_RADIO')),
  buildPlanStand('D', 0, 6, 'DATA_ADTECH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('D', c, 9, 'AUDIO_RADIO')),
  // Rangée E (DIFFUSION_INFRA + OUTDOOR_DOOH sur E0, E9/E10 latéraux 6m²) — 11 stands
  buildPlanStand('E', 0, 6, 'OUTDOOR_DOOH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('E', c, 9, 'DIFFUSION_INFRA')),
  buildPlanStand('E', 9, 6, 'DIFFUSION_INFRA'),
  buildPlanStand('E', 10, 6, 'DIFFUSION_INFRA'),
  // Rangée F (DIFFUSION_INFRA + OUTDOOR_DOOH sur F0) — 9 stands
  buildPlanStand('F', 0, 6, 'OUTDOOR_DOOH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('F', c, 9, 'DIFFUSION_INFRA')),
  // Rangée G (VIDEO_CTV + OUTDOOR_DOOH sur G0) — 9 stands
  buildPlanStand('G', 0, 6, 'OUTDOOR_DOOH'),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => buildPlanStand('G', c, 9, 'VIDEO_CTV')),
  // Rangée H (VIDEO_CTV, 4 stands isolés)
  buildPlanStand('H', 2, 6, 'VIDEO_CTV'),
  buildPlanStand('H', 3, 6, 'VIDEO_CTV'),
  buildPlanStand('H', 4, 6, 'VIDEO_CTV'),
  buildPlanStand('H', 9, 9, 'VIDEO_CTV'),
];

/**
 * P6.x.3 — Calcule une position approximative (en %) pour un stand
 * du plan Canva Le Nôtre à partir de son numéro `<lettre><col>`.
 *
 * Stratégie : grille 8 rangées × 11 colonnes, marges visuelles pour les
 * scènes PRS (côté gauche du plan Canva) et la droite. Cohérent avec le
 * UPDATE de la migration 0050. Sert au seed initial ET au front si on
 * souhaite re-calculer une position par défaut.
 */
export function calculateApproxPosition(
  letter: PlanStandSeed['letter'],
  col: number,
): {
  position_x: number;
  position_y: number;
  position_w: number;
  position_h: number;
} {
  const rowIndex = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(letter);
  const planMarginLeft = 22;
  const planMarginRight = 3;
  const planMarginTop = 12;
  const planMarginBottom = 8;
  const availableWidth = 100 - planMarginLeft - planMarginRight;
  const availableHeight = 100 - planMarginTop - planMarginBottom;
  const cellWidth = availableWidth / 11;
  const cellHeight = availableHeight / 8;
  return {
    position_x: planMarginLeft + (10 - col) * cellWidth,
    position_y: planMarginTop + rowIndex * cellHeight,
    position_w: cellWidth * 0.85,
    position_h: cellHeight * 0.85,
  };
}

/** Set de tous les numéros valides du plan, pour lookup rapide UI/tests. */
export const LE_NOTRE_PLAN_NUMBERS: ReadonlySet<string> = new Set(
  LE_NOTRE_PLAN_STANDS.map((s) => s.number),
);
