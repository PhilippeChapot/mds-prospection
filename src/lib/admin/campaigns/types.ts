/**
 * P8.3 — types partages pour l'Emailing Center.
 * Sans 'use server' = importable depuis client + server.
 */

import type { PrefKey } from '@/lib/admin/contact-preferences/types';

export const CAMPAIGN_CATEGORIES = [
  'general',
  'exposant',
  'facturation',
  'kit_media',
  'administration',
  'partenariat',
  'post_event',
] as const;
export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

/** Mapping category -> pref_xxx column (P8.1). */
export const CATEGORY_TO_PREF: Record<CampaignCategory, PrefKey> = {
  general: 'pref_general',
  exposant: 'pref_exposant',
  facturation: 'pref_facturation',
  kit_media: 'pref_kit_media',
  administration: 'pref_administration',
  partenariat: 'pref_partenariat',
  post_event: 'pref_post_event',
};

export type ContentMode = 'inline' | 'template';

/** Status etendu P8.3 (legacy enum + 'error'). */
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'archived'
  | 'cancelled'
  | 'error';

export interface AudienceFilters {
  /** Filtre par pole MDS (text[] overlap sur companies.pole). */
  poles?: string[];
  /** Filtre par etape salon ('paris', 'marseille', 'bruxelles'). */
  etapes?: string[];
  /** Filtre langue (FR/EN) — impacte aussi le template envoye. */
  langue?: 'FR' | 'EN';
}

export interface AudienceDef {
  key: string;
  label: string;
  description: string;
  /** Categorie de pref recommandee (l'admin peut override). */
  defaultCategory: CampaignCategory;
}

export interface AudiencePreviewResult {
  total_eligible: number;
  excluded_pref_off: number;
  excluded_unsubscribed: number;
  excluded_no_email: number;
  /** Apercu 5 premiers. */
  sample: Array<{
    contact_id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  }>;
}

export interface EligibleRecipient {
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  language: 'FR' | 'EN';
}

export interface SkippedRecipient {
  contact_id: string | null;
  email: string;
  reason: 'unsubscribed' | 'pref_off' | 'invalid_email' | 'duplicate';
}

export interface AudienceResolution {
  eligible: EligibleRecipient[];
  skipped: SkippedRecipient[];
}

export type CampaignActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };
