/**
 * P8.1 — types partages pour les preferences communication contact.
 * Sans 'use server' pour permettre l'import depuis client + server.
 */

export const PREF_KEYS = [
  'pref_general',
  'pref_exposant',
  'pref_facturation',
  'pref_kit_media',
  'pref_administration',
  'pref_partenariat',
  'pref_post_event',
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

export const LOCK_KEYS = [
  'general_locked_by_admin',
  'exposant_locked_by_admin',
  'facturation_locked_by_admin',
  'kit_media_locked_by_admin',
  'administration_locked_by_admin',
  'partenariat_locked_by_admin',
  'post_event_locked_by_admin',
] as const;
export type LockKey = (typeof LOCK_KEYS)[number];

/** Mapping pref -> lock correspondant (utilise dans l'UI). */
export const PREF_TO_LOCK: Record<PrefKey, LockKey> = {
  pref_general: 'general_locked_by_admin',
  pref_exposant: 'exposant_locked_by_admin',
  pref_facturation: 'facturation_locked_by_admin',
  pref_kit_media: 'kit_media_locked_by_admin',
  pref_administration: 'administration_locked_by_admin',
  pref_partenariat: 'partenariat_locked_by_admin',
  pref_post_event: 'post_event_locked_by_admin',
};

/** Metadonnees d'affichage par categorie (admin + futur espace contact). */
export interface PrefCategoryDef {
  key: PrefKey;
  lock_key: LockKey;
  emoji: string;
  label_fr: string;
  description_fr: string;
}

export const PREF_CATEGORIES: PrefCategoryDef[] = [
  {
    key: 'pref_general',
    lock_key: 'general_locked_by_admin',
    emoji: '📧',
    label_fr: 'Communications générales',
    description_fr: 'Newsletter, save-the-date, actualités MDS.',
  },
  {
    key: 'pref_exposant',
    lock_key: 'exposant_locked_by_admin',
    emoji: '🎤',
    label_fr: 'Informations exposant',
    description_fr: 'Logistique, planning, kit média, badges.',
  },
  {
    key: 'pref_facturation',
    lock_key: 'facturation_locked_by_admin',
    emoji: '💳',
    label_fr: 'Facturation et paiements',
    description_fr: 'Rappels paiement, factures et acomptes.',
  },
  {
    key: 'pref_kit_media',
    lock_key: 'kit_media_locked_by_admin',
    emoji: '🎨',
    label_fr: 'Kit communication',
    description_fr: 'Livraison du kit de communication exposant.',
  },
  {
    key: 'pref_administration',
    lock_key: 'administration_locked_by_admin',
    emoji: '🗂️',
    label_fr: 'Administration salon',
    description_fr: 'Formulaires badges, accès, plans, contraintes salle.',
  },
  {
    key: 'pref_partenariat',
    lock_key: 'partenariat_locked_by_admin',
    emoji: '🤝',
    label_fr: 'Partenariats et cross-sell',
    description_fr: "Opportunités, programme d'affiliation, sponsoring.",
  },
  {
    key: 'pref_post_event',
    lock_key: 'post_event_locked_by_admin',
    emoji: '📨',
    label_fr: 'Suivi post-événement',
    description_fr: 'Récap, replay, save-the-date édition suivante.',
  },
];

export interface ContactPreferencesRow {
  id: string;
  contact_id: string;
  pref_general: boolean;
  pref_exposant: boolean;
  pref_facturation: boolean;
  pref_kit_media: boolean;
  pref_administration: boolean;
  pref_partenariat: boolean;
  pref_post_event: boolean;
  general_locked_by_admin: boolean;
  exposant_locked_by_admin: boolean;
  facturation_locked_by_admin: boolean;
  kit_media_locked_by_admin: boolean;
  administration_locked_by_admin: boolean;
  partenariat_locked_by_admin: boolean;
  post_event_locked_by_admin: boolean;
  unsubscribed_all_at: string | null;
  unsubscribed_reason: string | null;
  updated_by_user_id: string | null;
  updated_at: string;
  created_at: string;
}

/** Valeurs par defaut (memes que la table — refletees pour le client). */
export const DEFAULT_PREFERENCES: Omit<
  ContactPreferencesRow,
  'id' | 'contact_id' | 'updated_by_user_id' | 'updated_at' | 'created_at'
> = {
  pref_general: true,
  pref_exposant: false,
  pref_facturation: false,
  pref_kit_media: false,
  pref_administration: false,
  pref_partenariat: false,
  pref_post_event: false,
  general_locked_by_admin: false,
  exposant_locked_by_admin: false,
  facturation_locked_by_admin: false,
  kit_media_locked_by_admin: false,
  administration_locked_by_admin: false,
  partenariat_locked_by_admin: false,
  post_event_locked_by_admin: false,
  unsubscribed_all_at: null,
  unsubscribed_reason: null,
};

/** Compte le nombre de pref actives (sur 7) pour affichage badge. */
export function countActivePreferences(row: ContactPreferencesRow): number {
  return PREF_KEYS.filter((k) => row[k] === true).length;
}

/** Compte le nombre de locks admin (sur 7). */
export function countLockedPreferences(row: ContactPreferencesRow): number {
  return LOCK_KEYS.filter((k) => row[k] === true).length;
}

export type ContactPreferencesActionResult = { ok: true } | { ok: false; error: string };
