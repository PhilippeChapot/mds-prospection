/**
 * P5.x.ExternalEvents — adapter SATIS 2025.
 *
 * Source : MD PROSPECTION/Partenaires_SATIS_2025.xlsx
 * Sheet : "Partenaires SATIS 2025"
 * Headers (18 cols) :
 *   Nom, Salon, Stand, Profil, Secteurs, Description, Site Web,
 *   Téléphone, Email, Adresse, Code Postal, Ville, Pays, LinkedIn,
 *   Facebook, Instagram, YouTube, URL Fiche.
 *
 * Donnees publiques (fiche partenaire SATIS) -> consentement implicite,
 * emailConfidence='verified' pour les emails (ce sont des contacts
 * generiques de la societe, type dpo@/contact@). Pas de prenom/nom.
 *
 * Enrichissement company (website, description, country, etc.) : SATIS
 * est la source la plus riche. L importer fera enrichCompanyIfEmpty.
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { normalizeCompanyName } from '../normalize';
import type {
  NormalizedImport,
  ImportedCompany,
  ImportedContact,
  ImportEnrichment,
} from '../types';

interface RawRow {
  Nom?: unknown;
  Salon?: unknown;
  Stand?: unknown;
  Profil?: unknown;
  Secteurs?: unknown;
  Description?: unknown;
  'Site Web'?: unknown;
  Téléphone?: unknown;
  Email?: unknown;
  Adresse?: unknown;
  'Code Postal'?: unknown;
  Ville?: unknown;
  Pays?: unknown;
  LinkedIn?: unknown;
  Facebook?: unknown;
  Instagram?: unknown;
  YouTube?: unknown;
}

const trim = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
};

export function parseSatisWorkbook(buf: Buffer): NormalizedImport {
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
  return parseSatisRows(rows);
}

export function parseSatisRows(rows: RawRow[]): NormalizedImport {
  const companies: ImportedCompany[] = [];

  for (const row of rows) {
    const rawName = trim(row.Nom);
    if (!rawName) continue;
    const normalizedName = normalizeCompanyName(rawName);
    if (!normalizedName) continue;

    const enrichment: ImportEnrichment = {
      website: trim(row['Site Web']),
      phone: trim(row.Téléphone),
      address: trim(row.Adresse),
      city: trim(row.Ville),
      postalCode: trim(row['Code Postal']),
      country: trim(row.Pays),
      linkedin: trim(row.LinkedIn),
      facebook: trim(row.Facebook),
      instagram: trim(row.Instagram),
      youtube: trim(row.YouTube),
      sector: trim(row.Secteurs),
      description: trim(row.Description),
    };

    const contacts: ImportedContact[] = [];
    const email = trim(row.Email);
    if (email && email.includes('@')) {
      contacts.push({
        email,
        emailConfidence: 'verified',
        phone: trim(row.Téléphone),
      });
    }

    companies.push({
      rawName,
      normalizedName,
      eventKey: 'satis',
      years: [2025],
      enrichment,
      contacts,
    });
  }

  return { source: 'satis', companies };
}

export function readSatisFile(filePath: string): NormalizedImport {
  return parseSatisWorkbook(readFileSync(filePath));
}
