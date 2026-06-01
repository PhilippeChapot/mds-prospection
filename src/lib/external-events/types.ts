/**
 * P5.x.ExternalEvents — types partages adapters + importer.
 *
 * Format normalise produit par les 4 adapters (md-classic/rde/satis/cbd).
 * L importer generique (importer.ts) consomme ce format independamment
 * de la source.
 */

export type ExternalEventSource = 'md_classic' | 'rde' | 'satis' | 'cbd';

/** Clef utilisee dans companies.external_event_tags (JSONB). */
export type ExternalEventKey = 'prs' | 'mediadays_classic' | 'rde' | 'satis' | 'cbd';

export type EmailConfidence = 'verified' | 'medium' | 'low';

export type ImportSource =
  | 'manual'
  | 'apollo'
  | 'sellsy'
  | 'signup'
  | 'import_md_classic'
  | 'import_rde'
  | 'import_satis'
  | 'import_cbd';

export interface ImportEnrichment {
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
  sector?: string;
  description?: string;
}

export interface ImportedContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  email?: string;
  emailConfidence: EmailConfidence;
  phone?: string;
  linkedin?: string;
}

export interface ImportedCompany {
  rawName: string;
  normalizedName: string;
  eventKey: ExternalEventKey;
  years: number[];
  enrichment?: ImportEnrichment;
  contacts: ImportedContact[];
}

export interface NormalizedImport {
  source: ExternalEventSource;
  companies: ImportedCompany[];
}

export interface ImportStats {
  source: ExternalEventSource;
  dryRun: boolean;
  matchedCompanies: number;
  createdCompanies: number;
  matchedContacts: number;
  createdContacts: number;
  enrichedCompanies: number;
  errors: Array<{ rawName: string; message: string }>;
}

/**
 * Map source -> event key. MD Classic source produit la clef
 * `mediadays_classic` (la clef PRS est reservee au PRS interne).
 */
export const SOURCE_TO_EVENT_KEY: Record<ExternalEventSource, ExternalEventKey> = {
  md_classic: 'mediadays_classic',
  rde: 'rde',
  satis: 'satis',
  cbd: 'cbd',
};

/**
 * Configuration affichage par event (utilisee par ExternalEventBadges
 * cote UI + libelles internes). Garde ordre stable pour le rendu.
 */
export interface EventDisplayConfig {
  key: ExternalEventKey;
  label: string;
  emoji: string;
  className: string;
  titleFr: string;
  titleEn: string;
}

export const EVENT_DISPLAY_CONFIGS: Record<ExternalEventKey, EventDisplayConfig> = {
  prs: {
    key: 'prs',
    label: 'PRS',
    emoji: '🟣',
    className: 'border-purple-400 bg-purple-50 text-purple-900',
    titleFr: 'Exposant Paris Radio Show',
    titleEn: 'Paris Radio Show exhibitor',
  },
  mediadays_classic: {
    key: 'mediadays_classic',
    label: 'MEDIADAYS',
    emoji: '🟠',
    className: 'border-orange-400 bg-orange-50 text-orange-900',
    titleFr: 'Exposant MediaDays Classic (Havas)',
    titleEn: 'MediaDays Classic exhibitor (Havas)',
  },
  rde: {
    key: 'rde',
    label: 'RDE',
    emoji: '🔵',
    className: 'border-blue-400 bg-blue-50 text-blue-900',
    titleFr: 'Exposant Radio Days Europe',
    titleEn: 'Radio Days Europe exhibitor',
  },
  satis: {
    key: 'satis',
    label: 'SATIS',
    emoji: '🟢',
    className: 'border-green-400 bg-green-50 text-green-900',
    titleFr: 'Exposant SATIS',
    titleEn: 'SATIS exhibitor',
  },
  cbd: {
    key: 'cbd',
    label: 'CBD',
    emoji: '🟡',
    className: 'border-yellow-400 bg-yellow-50 text-yellow-900',
    titleFr: 'Exposant Broadcast Days',
    titleEn: 'Broadcast Days exhibitor',
  },
};

export const EVENT_DISPLAY_ORDER: ExternalEventKey[] = [
  'prs',
  'mediadays_classic',
  'rde',
  'satis',
  'cbd',
];
