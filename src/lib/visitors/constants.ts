/**
 * P15.1.VisitorModel — constantes & labels visiteurs (safe client + serveur).
 *
 * Les pôles visiteur réutilisent la liste partagée `POLE_CODES`
 * (cf. design-tokens) pour rester alignés avec les prospects et permettre
 * le reporting cross-audience.
 */
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';

// Pôles : on réutilise tel quel la liste des prospects.
export const VISITOR_POLES = POLE_CODES;
export type VisitorPole = PoleCode;

// ─── Type de visiteur ─────────────────────────────────────────────────────
export const VISITOR_TYPES = [
  'professional',
  'press',
  'student',
  'vip',
  'speaker',
  'other',
] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const VISITOR_TYPE_LABEL: Record<VisitorType, string> = {
  professional: 'Professionnel',
  press: 'Presse',
  student: 'Étudiant',
  vip: 'VIP',
  speaker: 'Intervenant',
  other: 'Autre',
};

// ─── Statut ─────────────────────────────────────────────────────────────────
export const VISITOR_STATUSES = [
  'lead',
  'invited',
  'confirmed',
  'attended',
  'no_show',
  'cancelled',
] as const;
export type VisitorStatus = (typeof VISITOR_STATUSES)[number];

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  lead: 'Lead',
  invited: 'Invité',
  confirmed: 'Confirmé',
  attended: 'Présent',
  no_show: 'Absent',
  cancelled: 'Annulé',
};

export const VISITOR_STATUS_CLASS: Record<VisitorStatus, string> = {
  lead: 'bg-slate-100 text-slate-700',
  invited: 'bg-md-blue/10 text-md-blue',
  confirmed: 'bg-md-success/15 text-md-success',
  attended: 'bg-md-success/15 text-md-success',
  no_show: 'bg-md-warning/15 text-md-warning',
  cancelled: 'bg-md-danger/15 text-md-danger',
};

// ─── Source ───────────────────────────────────────────────────────────────
export const VISITOR_SOURCES = [
  'manual_admin',
  'signup_web',
  'converted_from_prospect',
  'import_xlsx',
  'cold_email_received',
  'apollo_smart_add',
] as const;
export type VisitorSource = (typeof VISITOR_SOURCES)[number];

export const VISITOR_SOURCE_LABEL: Record<VisitorSource, string> = {
  manual_admin: 'Ajout admin',
  signup_web: 'Inscription web',
  converted_from_prospect: 'Converti depuis prospect',
  import_xlsx: 'Import XLSX',
  cold_email_received: 'Cold email reçu',
  apollo_smart_add: 'Apollo Smart Add',
};

// ─── Langue ─────────────────────────────────────────────────────────────────
export const VISITOR_LANGUAGES = ['fr', 'en', 'es', 'de'] as const;
export type VisitorLanguage = (typeof VISITOR_LANGUAGES)[number];

export const VISITOR_LANGUAGE_LABEL: Record<VisitorLanguage, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

// ─── Visa status (pour la fiche / P15.4) ─────────────────────────────────────
export const VISA_STATUSES = ['not_needed', 'submitted', 'granted', 'refused', 'unknown'] as const;
export type VisaStatus = (typeof VISA_STATUSES)[number];

export const VISA_STATUS_LABEL: Record<VisaStatus, string> = {
  not_needed: 'Non requis',
  submitted: 'Soumis',
  granted: 'Accordé',
  refused: 'Refusé',
  unknown: 'Inconnu',
};

// ─── Shape ligne liste (sérialisable server -> client) ───────────────────────
export type VisitorListItem = {
  id: string;
  pole: string | null;
  visitor_type: string | null;
  is_vip: boolean;
  source: string;
  status: string;
  language: string;
  is_big_company: boolean;
  brevo_synced_at: string | null;
  notes: string | null;
  created_at: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_mobile: string | null;
  } | null;
  company: { id: string; name: string; website: string | null } | null;
  owner: { id: string; full_name: string | null; email: string } | null;
};
