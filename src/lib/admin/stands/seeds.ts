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
