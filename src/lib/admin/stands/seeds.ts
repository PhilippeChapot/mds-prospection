/**
 * P6.x.2a — seed builder pure (testable sans dépendance DB).
 *
 * Importé par scripts/seed-stands.ts (le script d'application) ET par
 * src/lib/admin/stands/seed-shape.test.ts (le test unitaire de structure).
 */

export interface StandSeed {
  number: string;
  salle: 'le_notre';
  taille_m2: number;
  pole_recommended: null;
  status: 'libre';
}

/**
 * 69 stands Le Nôtre :
 *   - L01..L15 : 15 stands à 6.0 m²
 *   - L16..L69 : 54 stands à 9.0 m²
 * Pôle recommandé non assigné (les 5 pôles MDS Solutions cohabitent).
 */
export function buildLeNotreSeeds(): StandSeed[] {
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
