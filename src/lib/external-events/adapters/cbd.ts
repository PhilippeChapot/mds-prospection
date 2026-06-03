/**
 * P5.x.ExternalEvents — adapter CBD 25 (Broadcast Days).
 *
 * Source : MD PROSPECTION/CBD 25  Partenaires.xlsx
 * Sheet : "Réponses au Formulaire Partenaire"
 * Headers : longs (formulaire Google avec emojis) — on resout par
 * pattern matching sur le contenu de l entete.
 *
 * Donnees via formulaire d inscription public -> consentement clair,
 * emailConfidence='medium' (les emails sont fournis volontairement
 * mais sans verification mailgun/etc).
 *
 * Nombreuses cellules vides a filtrer.
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

const trim = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
};

interface ColumnMap {
  company: string | null;
  person: string | null;
  email: string | null;
  description: string | null;
  role: string | null;
  linkedin: string | null;
  sector: string | null;
}

function detectColumns(headers: string[]): ColumnMap {
  const find = (regex: RegExp) => headers.find((h) => regex.test(h.toLowerCase())) ?? null;
  return {
    company: find(/nom de la soci[ée]t[ée]|company name/),
    person: find(/nom de la personne|name of the person/),
    email: find(/adresse e-?mail|^email$/),
    description: find(/description de la soci[ée]t[ée]|company description/),
    role: find(/fonction|position in the company/),
    linkedin: find(/linkedin/),
    sector: find(/secteur d.activit[ée]/),
  };
}

export function parseCbdWorkbook(buf: Buffer): NormalizedImport {
  const wb = XLSX.read(buf);
  const sheetName =
    wb.SheetNames.find((n) => /r[ée]ponses|formulaire/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return parseCbdRows(rows);
}

export function parseCbdRows(rows: Record<string, unknown>[]): NormalizedImport {
  if (rows.length === 0) return { source: 'cbd', companies: [] };

  const cols = detectColumns(Object.keys(rows[0]));
  const byKey = new Map<string, ImportedCompany>();

  for (const row of rows) {
    const rawName = cols.company ? trim(row[cols.company]) : undefined;
    if (!rawName) continue;
    const normalizedName = normalizeCompanyName(rawName);
    if (!normalizedName) continue;

    const email = cols.email ? trim(row[cols.email]) : undefined;
    const person = cols.person ? trim(row[cols.person]) : undefined;
    const role = cols.role ? trim(row[cols.role]) : undefined;
    const linkedin = cols.linkedin ? trim(row[cols.linkedin]) : undefined;
    const description = cols.description ? trim(row[cols.description]) : undefined;
    const sector = cols.sector ? trim(row[cols.sector]) : undefined;

    const contact: ImportedContact | null =
      email || person
        ? {
            fullName: person,
            role,
            email,
            linkedin,
            emailConfidence: 'medium',
          }
        : null;

    const enrichment: ImportEnrichment | undefined =
      description || sector
        ? {
            description,
            sector,
          }
        : undefined;

    const existing = byKey.get(normalizedName);
    if (existing) {
      if (contact) existing.contacts.push(contact);
      // Merge enrichment : on garde la 1ere description non vide.
      if (enrichment && existing.enrichment) {
        if (!existing.enrichment.description && enrichment.description) {
          existing.enrichment.description = enrichment.description;
        }
        if (!existing.enrichment.sector && enrichment.sector) {
          existing.enrichment.sector = enrichment.sector;
        }
      } else if (enrichment && !existing.enrichment) {
        existing.enrichment = enrichment;
      }
    } else {
      byKey.set(normalizedName, {
        rawName,
        normalizedName,
        eventKey: 'cbd',
        years: [2025],
        enrichment,
        contacts: contact ? [contact] : [],
      });
    }
  }

  return {
    source: 'cbd',
    companies: Array.from(byKey.values()),
  };
}

export function readCbdFile(filePath: string): NormalizedImport {
  return parseCbdWorkbook(readFileSync(filePath));
}
