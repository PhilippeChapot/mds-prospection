/**
 * P6.x.4-a — typed accessor au JSON taxonomie MDS 2026.
 *
 * Le JSON est généré par `pnpm build:taxonomy` à partir de
 * src/data/mds-taxonomy.md (lui-même copié depuis
 * COWORK/MDS2026-Reference-Maitre.md). Il est committed pour rendre
 * les builds reproductibles + permettre un fallback en cas de pb script.
 */

import taxonomyJson from '@/data/mds-taxonomy.json';

export interface PoleSubSector {
  name: string;
  count: number;
  exemples: string[];
}

export interface Pole {
  code: string;
  name: string;
  emoji: string;
  color: string;
  category: 'mediadays_classique' | 'mediadays_solutions';
  sub_label: string | null;
  zone: string | null;
  description: string;
  sous_secteurs: PoleSubSector[];
  total_sous_secteurs: number;
  total_exposants_cibles: number;
}

export interface VisitorFamily {
  id: number;
  name: string;
  count: number;
  affinite_poles: string[];
  affinite_levels: number[];
  exemples: string[];
  fonctions: string;
  action_landing: 'external_mediadays_net' | 'institutionnel_form' | 'ecole_form';
}

export interface Taxonomy {
  version: string;
  generated_at: string;
  poles: Pole[];
  visiteurs: VisitorFamily[];
  stats: {
    total_poles: number;
    total_sous_secteurs: number;
    total_exposants_cibles: number;
    total_visiteurs_families: number;
    total_visiteurs_entites: number;
  };
}

export function getTaxonomy(): Taxonomy {
  return taxonomyJson as Taxonomy;
}

export function getPoleByCode(code: string): Pole | undefined {
  return getTaxonomy().poles.find((p) => p.code === code);
}
