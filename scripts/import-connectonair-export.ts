/**
 * P5.x.ConnectOnAirDirectoryCache — import XLSX vers connectonair_directory.
 *
 * Usage :
 *   pnpm tsx scripts/import-connectonair-export.ts --dry-run
 *   pnpm tsx scripts/import-connectonair-export.ts
 *   pnpm tsx scripts/import-connectonair-export.ts --file /path/to/coa.xlsx
 *   pnpm tsx scripts/import-connectonair-export.ts --batch 500
 *
 * Strategie :
 *   1. Lecture XLSX via lib `xlsx` (sheet_to_json header:1 -> array de cells).
 *   2. Skip ligne 1 (titre export) + ligne 2 (header). Iteration ligne 3+.
 *   3. Dedup applicatif via Map<source_societe_id, true>. La 1ere row
 *      contient les donnees authoritative pour chaque societe (jointure
 *      societe x contact cote CoA -> N rows par societe).
 *   4. Normalisation pays via normalizeCountryToIso + nom via
 *      normalizeNameJs (doctrine P5.x.MatchingFix).
 *   5. raw_data JSONB = snapshot des cols 0-47 pour debug ulterieur.
 *   6. Upsert idempotent via .upsert({...}, { onConflict: 'source_societe_id' }).
 *
 * Pre-requis :
 *   - Migration 0078 appliquee en DB (pnpm db:push) + types regen
 *     (pnpm db:types) — sinon le payload insert sera cast `as never` pour
 *     bypass le typage Supabase.
 *   - Variables env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameJs } from '../src/lib/external-events/normalize-query';
import { normalizeCountryToIso } from '../src/lib/format/country';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/COWORK/ConnectOnAir-export-2026-06.xlsx';

// Indices XLSX (header ligne 2, validé Cowork 2026-06-06).
const COL = {
  site_id: 0,
  societe_id: 1,
  forme_juridique: 2,
  siret: 3,
  adresse: 4,
  complement_adresse: 5,
  code_postal: 6,
  ville: 7,
  pays: 8,
  code_pays: 9,
  telephone: 10,
  fax: 11,
  mail: 12,
  url: 13,
  est_radio: 14,
  est_public: 15,
  date_de_creation: 16,
  date_de_maj: 17,
  raison_social: 18,
  abrege: 19,
  sigle: 20,
  categorie: 21,
  unik_id: 27,
  type_exposant: 30,
  keyword: 31,
  instagram: 32,
  facebook: 33,
  twitter: 34,
  linkedin: 35,
  activites: 44,
  produits: 45,
  marques: 46,
  frequences: 47,
} as const;

export type DirectoryRow = {
  source_societe_id: string;
  source_unik_id: string | null;
  name: string;
  normalized_name: string;
  name_abrege: string | null;
  sigle: string | null;
  forme_juridique: string | null;
  siret: string | null;
  address: string | null;
  address_complement: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  est_radio: boolean | null;
  est_public: boolean | null;
  categorie: string | null;
  type_exposant: string | null;
  keyword: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  activites: string | null;
  produits: string | null;
  marques: string | null;
  frequences: string | null;
  raw_data: Record<string, unknown>;
  source_updated_at: string | null;
  import_batch_id: string;
};

// ───────────────────────────────────────────────────────────────────────
// Helpers de cast cell -> valeur typee
// ───────────────────────────────────────────────────────────────────────

function cellToString(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim();
  return s.length === 0 || s === 'NULL' ? null : s;
}

/**
 * CoA encode est_radio / est_public sur :
 *   '1' | 1   -> true
 *   'N' | '0' -> false (N = "Non")
 *   null/empty/'NULL' -> null
 */
function cellToBool(cell: unknown): boolean | null {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim().toUpperCase();
  if (s === '' || s === 'NULL') return null;
  if (s === '1' || s === 'TRUE' || s === 'YES' || s === 'OUI') return true;
  if (s === 'N' || s === '0' || s === 'FALSE' || s === 'NO' || s === 'NON') return false;
  return null;
}

/**
 * CoA stocke les dates en string '2024-05-12 14:32:01' ou ISO. Tente un
 * parse robuste, retourne null si invalide ou vide.
 */
function cellToTimestamp(cell: unknown): string | null {
  const s = cellToString(cell);
  if (!s) return null;
  // Excel renvoie parfois un nombre serie (jours depuis 1900). Si c est
  // un nombre brut, on laisse XLSX faire le travail en amont (cellDates).
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ───────────────────────────────────────────────────────────────────────
// Mapping row XLSX -> DirectoryRow
// ───────────────────────────────────────────────────────────────────────

export function mapRowToDirectoryRow(row: unknown[], importBatchId: string): DirectoryRow | null {
  const societeId = cellToString(row[COL.societe_id]);
  if (!societeId) return null; // skip rows sans cle metier

  const name = cellToString(row[COL.raison_social]) ?? '';
  if (!name) return null; // skip rows sans nom (donnee inutilisable)

  // raw_data : snapshot des cols 0-47 (cols contact 48+ ignorees V1).
  const rawData: Record<string, unknown> = {};
  for (let i = 0; i < 48; i++) {
    if (row[i] !== undefined && row[i] !== null && row[i] !== '') {
      rawData[String(i)] = row[i];
    }
  }

  return {
    source_societe_id: societeId,
    source_unik_id: cellToString(row[COL.unik_id]),
    name,
    normalized_name: normalizeNameJs(name),
    name_abrege: cellToString(row[COL.abrege]),
    sigle: cellToString(row[COL.sigle]),
    forme_juridique: cellToString(row[COL.forme_juridique]),
    siret: cellToString(row[COL.siret]),
    address: cellToString(row[COL.adresse]),
    address_complement: cellToString(row[COL.complement_adresse]),
    postal_code: cellToString(row[COL.code_postal]),
    city: cellToString(row[COL.ville]),
    country: normalizeCountryToIso(cellToString(row[COL.pays])),
    country_code: cellToString(row[COL.code_pays]),
    phone: cellToString(row[COL.telephone]),
    fax: cellToString(row[COL.fax]),
    email: cellToString(row[COL.mail]),
    website: cellToString(row[COL.url]),
    est_radio: cellToBool(row[COL.est_radio]),
    est_public: cellToBool(row[COL.est_public]),
    categorie: cellToString(row[COL.categorie]),
    type_exposant: cellToString(row[COL.type_exposant]),
    keyword: cellToString(row[COL.keyword]),
    instagram_url: cellToString(row[COL.instagram]),
    facebook_url: cellToString(row[COL.facebook]),
    twitter_url: cellToString(row[COL.twitter]),
    linkedin_url: cellToString(row[COL.linkedin]),
    activites: cellToString(row[COL.activites]),
    produits: cellToString(row[COL.produits]),
    marques: cellToString(row[COL.marques]),
    frequences: cellToString(row[COL.frequences]),
    raw_data: rawData,
    source_updated_at: cellToTimestamp(row[COL.date_de_maj]),
    import_batch_id: importBatchId,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Iterateur XLSX -> DirectoryRow[] (avec dedup applicatif)
// ───────────────────────────────────────────────────────────────────────

export type ParseStats = {
  totalRows: number;
  uniqueSocieteIds: number;
  skippedNoId: number;
  skippedNoName: number;
  skippedDuplicates: number;
  countryNormalized: number;
  withRadioFlag: number;
};

export function parseXlsxRows(
  filePath: string,
  importBatchId: string,
): { rows: DirectoryRow[]; stats: ParseStats } {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('XLSX : aucun sheet trouve.');
  const sheet = wb.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const stats: ParseStats = {
    totalRows: 0,
    uniqueSocieteIds: 0,
    skippedNoId: 0,
    skippedNoName: 0,
    skippedDuplicates: 0,
    countryNormalized: 0,
    withRadioFlag: 0,
  };
  const seen = new Set<string>();
  const out: DirectoryRow[] = [];

  // Skip ligne 1 (titre) + ligne 2 (header) -> iterer ligne 3+ = index 2+.
  for (let i = 2; i < allRows.length; i++) {
    stats.totalRows++;
    const row = allRows[i];
    const societeId = cellToString(row[COL.societe_id]);
    if (!societeId) {
      stats.skippedNoId++;
      continue;
    }
    if (seen.has(societeId)) {
      stats.skippedDuplicates++;
      continue;
    }
    const mapped = mapRowToDirectoryRow(row, importBatchId);
    if (!mapped) {
      stats.skippedNoName++;
      continue;
    }
    seen.add(societeId);
    out.push(mapped);
    if (mapped.country) stats.countryNormalized++;
    if (mapped.est_radio === true) stats.withRadioFlag++;
  }
  stats.uniqueSocieteIds = out.length;
  return { rows: out, stats };
}

// ───────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;
  const batchIdx = args.indexOf('--batch');
  const batchSize = batchIdx >= 0 ? Number(args[batchIdx + 1]) : 500;

  console.log(dryRun ? '🔍 DRY RUN — aucune ecriture DB' : '⚠️  LIVE RUN — ecriture DB');
  console.log(`📂 file = ${file}`);
  console.log(`📦 batch size = ${batchSize}`);

  const importBatchId = randomUUID();
  console.log(`🏷️  batch_id = ${importBatchId}`);

  console.log('\n→ Parsing XLSX…');
  const t0 = Date.now();
  const { rows, stats } = parseXlsxRows(file, importBatchId);
  const tParse = Date.now() - t0;
  console.log(`✓ parse en ${tParse}ms`);
  console.log('📊 Stats parse :');
  console.log(`   totalRows         : ${stats.totalRows}`);
  console.log(`   uniqueSocieteIds  : ${stats.uniqueSocieteIds}`);
  console.log(`   skippedNoId       : ${stats.skippedNoId}`);
  console.log(`   skippedNoName     : ${stats.skippedNoName}`);
  console.log(`   skippedDuplicates : ${stats.skippedDuplicates}`);
  console.log(`   countryNormalized : ${stats.countryNormalized}`);
  console.log(`   withRadioFlag (est_radio=1) : ${stats.withRadioFlag}`);

  if (dryRun) {
    console.log('\n🔍 Sample 3 premieres rows mappees :');
    for (const r of rows.slice(0, 3)) {
      console.log(JSON.stringify({ ...r, raw_data: '<omitted>' }, null, 2));
    }
    console.log('\n✅ DRY RUN OK — pas d ecriture DB.');
    return;
  }

  // Live run.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env.local');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('\n→ Upsert vers connectonair_directory…');
  let upserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    // Cast `as never[]` : le type Supabase generated n inclut pas encore
    // toutes les colonnes ajoutees par 0078 tant que `pnpm db:types` n a
    // pas tourne post-push. A retirer apres regen.
    const { error } = await supabase.from('connectonair_directory').upsert(chunk as never[], {
      onConflict: 'source_societe_id',
      ignoreDuplicates: false,
    });
    if (error) {
      errors += chunk.length;
      console.error(`✗ batch ${i}-${i + chunk.length} : ${error.message}`);
    } else {
      upserted += chunk.length;
      if (upserted % 2000 === 0 || upserted === rows.length) {
        console.log(`   ${upserted}/${rows.length} upserted…`);
      }
    }
  }

  console.log('\n📈 Stats import :');
  console.log(`   upserted : ${upserted}`);
  console.log(`   errors   : ${errors}`);
  console.log(`   batch_id : ${importBatchId}`);
  if (errors === 0) {
    console.log('\n✅ IMPORT OK.');
  } else {
    console.log('\n⚠️  IMPORT PARTIEL — relancer apres correction des erreurs.');
    process.exitCode = 1;
  }
}

// Pas d auto-execute en import test : on detecte si on est invoque en CLI.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
