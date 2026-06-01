/**
 * P5.x.ExternalEvents — adapter RDE 2026 (Radio Days Europe).
 *
 * Source : MD PROSPECTION/Exposants_RDE2026_emails_déduits.xlsx
 * Sheet : "Emails Déduits"
 * Headers : Société, Nom complet, Fonction, Email, Source, Confiance.
 *
 * Les emails sont DEDUITS (pattern prenom.nom) -> emailConfidence='low'
 * pour TOUS les contacts, peu importe la valeur "Confiance" du fichier.
 * Doctrine RGPD : ces contacts auront pref_marketing=false par defaut,
 * ne seront jamais cibles automatiquement par une campagne Brevo.
 *
 * Plusieurs contacts peuvent partager la meme societe -> on regroupe.
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { normalizeCompanyName } from '../normalize';
import type { NormalizedImport, ImportedCompany, ImportedContact } from '../types';

interface RawRow {
  Société?: unknown;
  'Nom complet'?: unknown;
  Fonction?: unknown;
  Email?: unknown;
  Source?: unknown;
  Confiance?: unknown;
}

export function parseRdeWorkbook(buf: Buffer): NormalizedImport {
  const wb = XLSX.read(buf);
  const sheetName =
    wb.SheetNames.find((n) => /déduits|deduits|emails/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
  return parseRdeRows(rows);
}

export function parseRdeRows(rows: RawRow[]): NormalizedImport {
  const byKey = new Map<string, ImportedCompany>();

  for (const row of rows) {
    const rawName = String(row.Société ?? '').trim();
    if (!rawName) continue;
    const normalizedName = normalizeCompanyName(rawName);
    if (!normalizedName) continue;

    const fullName = String(row['Nom complet'] ?? '').trim();
    const role = String(row.Fonction ?? '').trim();
    const email = String(row.Email ?? '').trim();
    const contact: ImportedContact = {
      fullName: fullName || undefined,
      role: role || undefined,
      email: email || undefined,
      emailConfidence: 'low',
    };

    const existing = byKey.get(normalizedName);
    if (existing) {
      if (contact.email || contact.fullName) existing.contacts.push(contact);
    } else {
      byKey.set(normalizedName, {
        rawName,
        normalizedName,
        eventKey: 'rde',
        years: [2026],
        contacts: contact.email || contact.fullName ? [contact] : [],
      });
    }
  }

  return {
    source: 'rde',
    companies: Array.from(byKey.values()),
  };
}

export function readRdeFile(filePath: string): NormalizedImport {
  return parseRdeWorkbook(readFileSync(filePath));
}
