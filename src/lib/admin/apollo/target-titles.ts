/**
 * P5.x.SmartAddApolloEnrichment — titres ciblés pour la recherche de
 * décideurs Apollo (6 catégories, FR + EN, priorité 1/2).
 *
 * Priorité 1 = cibles principales du business MDS (direction, marketing,
 * communication). Priorité 2 = secondaires (management intermédiaire,
 * technique, digital). Module pur (pas de 'use server').
 */

export interface TargetTitleGroup {
  category: string;
  priority: 1 | 2;
  titles: string[];
}

export const APOLLO_TARGET_TITLES: TargetTitleGroup[] = [
  {
    category: 'Direction générale',
    priority: 1,
    titles: [
      'CEO',
      'Chief Executive Officer',
      'Directeur Général',
      'Directrice Générale',
      'Président',
      'Gérant',
      'Founder',
      'Co-Founder',
    ],
  },
  {
    category: 'Marketing (direction)',
    priority: 1,
    titles: [
      'CMO',
      'Chief Marketing Officer',
      'Directeur Marketing',
      'Directrice Marketing',
      'VP Marketing',
      'Head of Marketing',
    ],
  },
  {
    category: 'Communication (direction)',
    priority: 1,
    titles: [
      'Directeur Communication',
      'Directrice Communication',
      'Communications Director',
      'Head of Communications',
      'Directeur de la Communication',
    ],
  },
  {
    category: 'Marketing (management)',
    priority: 2,
    titles: ['Marketing Manager', 'Responsable Marketing', 'Brand Manager', 'Chef de Produit'],
  },
  {
    category: 'Technique',
    priority: 2,
    titles: [
      'CTO',
      'Chief Technology Officer',
      'Directeur Technique',
      'VP Engineering',
      'Head of Technology',
    ],
  },
  {
    category: 'Média / Digital',
    priority: 2,
    titles: [
      'Directeur Digital',
      'Head of Digital',
      'Media Director',
      'Directeur des Médias',
      'Responsable Communication',
    ],
  },
];

/** Tous les titres à plat, pour le paramètre `person_titles` d'Apollo. */
export function allTargetTitles(): string[] {
  return APOLLO_TARGET_TITLES.flatMap((g) => g.titles);
}

/**
 * Priorité d'un titre renvoyé par Apollo (match insensible à la casse, par
 * inclusion). Renvoie 1 si un groupe priorité 1 matche, sinon 2 si un
 * groupe priorité 2 matche, sinon null (hors cible).
 */
export function priorityForTitle(title: string | null | undefined): 1 | 2 | null {
  if (!title) return null;
  const t = title.toLowerCase();
  let fallback: 1 | 2 | null = null;
  for (const group of APOLLO_TARGET_TITLES) {
    if (group.titles.some((x) => t.includes(x.toLowerCase()))) {
      if (group.priority === 1) return 1;
      fallback = 2;
    }
  }
  return fallback;
}
