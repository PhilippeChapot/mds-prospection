/**
 * Constantes et labels safe pour client + serveur (pas d'import next/headers).
 * Reexportes par queries.ts pour le code serveur.
 */
import type { Database } from './database.types';

export type ProspectStatus = Database['public']['Enums']['prospect_status'];
export type PackCode = Database['public']['Enums']['pack_code'];
export type CategoryTarif = Database['public']['Enums']['category_tarif'];

export const PIPELINE_ORDER: ProspectStatus[] = [
  'lead',
  'contact',
  'devis_envoye',
  'signe',
  'acompte_paye',
  'paye_integral',
  'perdu',
];

export const PROSPECT_STATUSES: ProspectStatus[] = PIPELINE_ORDER;

export const PROSPECT_STATUS_LABEL_FR: Record<ProspectStatus, string> = {
  lead: 'Lead',
  contact: 'En contact',
  devis_envoye: 'Devis envoyé',
  signe: 'Devis signé',
  acompte_paye: 'Acompte payé',
  paye_integral: 'Payé intégral',
  perdu: 'Perdu',
};

export const PROSPECT_STATUS_LABEL_EN: Record<ProspectStatus, string> = {
  lead: 'Lead',
  contact: 'In contact',
  devis_envoye: 'Quote sent',
  signe: 'Quote signed',
  acompte_paye: 'Deposit paid',
  paye_integral: 'Fully paid',
  perdu: 'Lost',
};

export const PACK_CODES: PackCode[] = ['ACCESS', 'CLASSIC', 'PREMIUM', 'A_DEFINIR'];

export const PACK_LABEL: Record<PackCode, string> = {
  ACCESS: 'ACCESS',
  CLASSIC: 'CLASSIC',
  PREMIUM: 'PREMIUM',
  A_DEFINIR: 'A definir',
};

export type ProspectListItem = {
  id: string;
  status: ProspectStatus;
  pack_code: PackCode;
  estimated_amount: number | null;
  owner_id: string | null;
  affiliate_id: string | null;
  is_test: boolean;
  created_at: string;
  last_activity_at: string;
  company: {
    id: string;
    name: string;
    category: CategoryTarif;
    was_prs_2026_exhibitor: boolean;
    external_event_tags: Record<string, unknown>;
    phone: string | null;
    pole: { code: string; name_fr: string } | null;
  } | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone_mobile: string | null;
  } | null;
  owner: { id: string; full_name: string | null; email: string } | null;
};

export type CompanyListItem = {
  id: string;
  name: string;
  primary_domain: string | null;
  country: string | null;
  category: CategoryTarif;
  was_prs_2026_exhibitor: boolean;
  external_event_tags: Record<string, unknown>;
  // P5.x.CompaniesAddressAndTags
  raw_address: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
  created_at: string;
  pole: { code: string; name_fr: string } | null;
  /** P5.x.ProspectionIndicators — au moins un contact de la société est prospect. */
  has_prospected_contact: boolean;
};
