/**
 * Constantes et labels safe pour client + serveur (pas d'import next/headers).
 * Reexportes par queries.ts pour le code serveur.
 */
import type { Database } from './database.types';

export type ProspectStatus = Database['public']['Enums']['prospect_status'];
export type PackCode = Database['public']['Enums']['pack_code'];
export type CategoryTarif = Database['public']['Enums']['category_tarif'];

export const PROSPECT_STATUSES: ProspectStatus[] = [
  'lead',
  'contact',
  'devis_envoye',
  'acompte_paye',
  'paye_integral',
  'signe',
  'perdu',
];

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
