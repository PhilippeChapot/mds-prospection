/**
 * P5.x.SmartAddApolloEnrichment — types partagés (client + server) pour
 * l'enrichissement « décideurs » post-confirmSmartAdd.
 *
 * Module pur (pas de 'use server') → peut exporter const/type, importable
 * depuis les composants client comme depuis les server actions.
 */

/** Candidat décideur retourné par la recherche Apollo, prêt pour la modale. */
export interface ApolloDecisionMakerCandidate {
  /** id Apollo (dédoublonnage intra-résultats). */
  apolloId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  /** Email réel si Apollo l'a débloqué, sinon null (→ placeholder à la création). */
  email: string | null;
  /** 1 = cible prioritaire (DG/Marketing/Com), 2 = secondaire. */
  priority: 1 | 2;
}

export interface SearchDecisionMakersResult {
  ok: boolean;
  candidates: ApolloDecisionMakerCandidate[];
  error?: string;
  /** Nombre de candidats écartés car déjà présents dans la company. */
  dedupedCount?: number;
}

export interface CreateContactsFromApolloResult {
  ok: boolean;
  created: number;
  skipped: number;
  error?: string;
}
