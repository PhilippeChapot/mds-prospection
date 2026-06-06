/**
 * Types et constantes partages client/server pour /admin/signups.
 * Fichier neutre : pas d'import next/headers ou supabase server.
 */

export const SIGNUP_STATUSES = [
  'awaiting_verification',
  'verified',
  'step2_started',
  'step2_completed',
  'converted',
  'rejected',
  'expired',
] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  awaiting_verification: 'En attente DOI',
  verified: 'DOI validé',
  step2_started: 'Étape 2 entamée',
  step2_completed: 'Étape 2 terminée',
  converted: 'Converti',
  rejected: 'Rejeté',
  expired: 'Expiré',
};

export const SIGNUP_STATUS_CLASS: Record<SignupStatus, string> = {
  awaiting_verification: 'bg-slate-100 text-slate-700',
  verified: 'bg-md-blue/10 text-md-blue',
  step2_started: 'bg-md-warning/15 text-md-warning',
  step2_completed: 'bg-md-blue/15 text-md-blue-dark',
  converted: 'bg-md-success/15 text-md-success',
  rejected: 'bg-md-danger/15 text-md-danger',
  expired: 'bg-slate-200 text-slate-600',
};

export const SIGNUP_CATEGORIES = ['partenaire', 'sponsor'] as const;
export type SignupCategory = (typeof SIGNUP_CATEGORIES)[number];

export interface SignupRow {
  id: string;
  email: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyNameInput: string | null;
  category: 'partenaire' | 'sponsor' | null;
  derivedCategory: 'prs_exhibitor' | 'standard' | 'non_eligible';
  language: 'FR' | 'EN';
  status: SignupStatus;
  aiPoleCode: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  createdAt: string;
  verifiedAt: string | null;
  step2SubmittedAt: string | null;
  convertedToProspectId: string | null;
  /** P5.x.ExternalEvents - tags multi-events de la matched_company (null si pas matchee). */
  externalEventTags: Record<string, unknown> | null;
}
