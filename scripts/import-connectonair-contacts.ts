/**
 * P5.x.ConnectOnAirContactsCache (V2) — import XLSX vers
 * connectonair_directory_contacts (cols 48-78).
 *
 * Usage :
 *   pnpm tsx scripts/import-connectonair-contacts.ts --dry-run
 *   pnpm tsx scripts/import-connectonair-contacts.ts
 *   pnpm tsx scripts/import-connectonair-contacts.ts --file /path/to/coa.xlsx
 *   pnpm tsx scripts/import-connectonair-contacts.ts --batch 500
 *
 * Strategie :
 *   1. Lecture XLSX (header sur rows[0], data sur rows[1+]).
 *   2. Dedup applicatif via Map<source_user_id> — la 1ere row par user_id
 *      contient les donnees authoritative.
 *   3. Skip rows sans user_id (col[49]) ou sans email exploitable.
 *   4. email_normalized = LOWER(TRIM(email)) cote applicatif (mirror DB).
 *   5. coa_societe_id ← col[1] societe_id (PAS col[48] site_id, qui est
 *      constant=1 et designe l ID du SITE CoA, pas la societe parent).
 *   6. raw_data JSONB = snapshot cols 48-78 brutes.
 *   7. Upsert idempotent ON CONFLICT source_user_id.
 *
 * Pre-requis :
 *   - Migration 0080 appliquee (pnpm db:push) + types regen (pnpm db:types).
 *     Sinon payload insert cast `as never` pour bypasser le typage.
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeCountryToIso } from '../src/lib/format/country';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/COWORK/ConnectOnAir-export-2026-06.xlsx';

// Indices XLSX (header valide Cowork 2026-06-06).
// Cols societe = 0-47 (importees par V1, source_societe_id = col[1]).
// Cols contact = 48-78 (importees par V2).
const COL = {
  societe_id_parent: 1, // V1 col[1] = FK metier vers societe parent
  // Cols contact (48-78) :
  site_id_contact: 48, // toujours = 1 (id du site CoA, pas utile)
  user_id: 49, // CLE DE DEDUP CONTACT
  genre: 50,
  nom: 51,
  prenom: 52,
  adresse: 53,
  adresse_2: 54,
  adresse_3: 55,
  complement_adresse: 56,
  ville: 57,
  code_postal: 58,
  etat: 59,
  pays: 60,
  telephone: 61,
  mobil: 62,
  fax: 63,
  mail: 64,
  mail_valide: 65,
  type_profil: 66,
  civilite: 67,
  langue: 68,
  unik_id: 69,
  rgpd: 70,
  date_create: 71,
  date_update: 72,
  mail_additionnel: 73,
  send_in_blue: 74,
  linkedin_id: 75,
  famillefonction: 76,
  fonction: 77,
} as const;

export type ContactRow = {
  source_user_id: number;
  source_unik_id: string | null;
  coa_societe_id: string | null;
  first_name: string | null;
  last_name: string | null;
  civility: string | null;
  genre: string | null;
  email: string | null;
  email_normalized: string | null;
  email_valid: boolean | null;
  email_additional: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  role: string | null;
  family_function: string | null;
  type_profil: string | null;
  address: string | null;
  address_2: string | null;
  address_3: string | null;
  address_complement: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country: string | null;
  language: string | null;
  linkedin_url: string | null;
  rgpd: boolean | null;
  send_in_blue: string | null;
  raw_data: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
  import_batch_id: string;
};

// ───────────────────────────────────────────────────────────────────────
// Helpers de cast (memes regles que V1 societes)
// ───────────────────────────────────────────────────────────────────────

function cellToString(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim();
  return s.length === 0 || s === 'NULL' ? null : s;
}

function cellToBool(cell: unknown): boolean | null {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim().toUpperCase();
  if (s === '' || s === 'NULL') return null;
  if (s === '1' || s === 'TRUE' || s === 'YES' || s === 'OUI' || s === 'Y') return true;
  if (s === 'N' || s === '0' || s === 'FALSE' || s === 'NO' || s === 'NON') return false;
  return null;
}

function cellToInt(cell: unknown): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number' && Number.isFinite(cell)) return Math.trunc(cell);
  const s = String(cell).trim();
  if (!s || s === 'NULL') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function cellToTimestamp(cell: unknown): string | null {
  const s = cellToString(cell);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Normalisation email : LOWER + TRIM. Mirror cote DB (col email_normalized).
 * Doctrine [[feedback_normalize_name_for_matching]] etendue aux emails.
 */
export function normalizeEmailForMatching(email: string | null | undefined): string | null {
  if (!email) return null;
  const s = email.trim().toLowerCase();
  // Filtre minimal : doit contenir un @ et ne pas etre 'null' string.
  if (!s || s === 'null' || !s.includes('@')) return null;
  return s;
}

// ───────────────────────────────────────────────────────────────────────
// Mapping row XLSX -> ContactRow
// ───────────────────────────────────────────────────────────────────────

export function mapRowToContactRow(row: unknown[], importBatchId: string): ContactRow | null {
  const userId = cellToInt(row[COL.user_id]);
  if (!userId) return null; // skip rows sans cle metier

  // raw_data : snapshot des cols 48-78.
  const rawData: Record<string, unknown> = {};
  for (let i = 48; i < 79; i++) {
    if (row[i] !== undefined && row[i] !== null && row[i] !== '') {
      rawData[String(i)] = row[i];
    }
  }

  const email = cellToString(row[COL.mail]);
  const emailNorm = normalizeEmailForMatching(email);

  return {
    source_user_id: userId,
    source_unik_id: cellToString(row[COL.unik_id]),
    coa_societe_id: cellToString(row[COL.societe_id_parent]),
    first_name: cellToString(row[COL.prenom]),
    last_name: cellToString(row[COL.nom]),
    civility: cellToString(row[COL.civilite]),
    genre: cellToString(row[COL.genre]),
    email,
    email_normalized: emailNorm,
    email_valid: cellToBool(row[COL.mail_valide]),
    email_additional: cellToString(row[COL.mail_additionnel]),
    phone: cellToString(row[COL.telephone]),
    mobile: cellToString(row[COL.mobil]),
    fax: cellToString(row[COL.fax]),
    role: cellToString(row[COL.fonction]),
    family_function: cellToString(row[COL.famillefonction]),
    type_profil: cellToString(row[COL.type_profil]),
    address: cellToString(row[COL.adresse]),
    address_2: cellToString(row[COL.adresse_2]),
    address_3: cellToString(row[COL.adresse_3]),
    address_complement: cellToString(row[COL.complement_adresse]),
    city: cellToString(row[COL.ville]),
    postal_code: cellToString(row[COL.code_postal]),
    state: cellToString(row[COL.etat]),
    country: normalizeCountryToIso(cellToString(row[COL.pays])),
    language: cellToString(row[COL.langue]),
    linkedin_url: cellToString(row[COL.linkedin_id]),
    rgpd: cellToBool(row[COL.rgpd]),
    send_in_blue: cellToString(row[COL.send_in_blue]),
    raw_data: rawData,
    source_created_at: cellToTimestamp(row[COL.date_create]),
    source_updated_at: cellToTimestamp(row[COL.date_update]),
    import_batch_id: importBatchId,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Iterateur XLSX -> ContactRow[]
// ───────────────────────────────────────────────────────────────────────

export type ParseStats = {
  totalRows: number;
  uniqueUserIds: number;
  skippedNoUserId: number;
  skippedDuplicates: number;
  withEmail: number;
  withEmailNormalized: number;
  withLinkedin: number;
  withPhone: number;
};

export function parseContactsXlsx(
  filePath: string,
  importBatchId: string,
): { rows: ContactRow[]; stats: ParseStats } {
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
    uniqueUserIds: 0,
    skippedNoUserId: 0,
    skippedDuplicates: 0,
    withEmail: 0,
    withEmailNormalized: 0,
    withLinkedin: 0,
    withPhone: 0,
  };
  const seen = new Set<number>();
  const out: ContactRow[] = [];

  // Header sur rows[0], data sur rows[1+] (corrige off-by-one V1).
  for (let i = 1; i < allRows.length; i++) {
    stats.totalRows++;
    const row = allRows[i];
    const userId = cellToInt(row[COL.user_id]);
    if (!userId) {
      stats.skippedNoUserId++;
      continue;
    }
    if (seen.has(userId)) {
      stats.skippedDuplicates++;
      continue;
    }
    const mapped = mapRowToContactRow(row, importBatchId);
    if (!mapped) {
      stats.skippedNoUserId++;
      continue;
    }
    seen.add(userId);
    out.push(mapped);
    if (mapped.email) stats.withEmail++;
    if (mapped.email_normalized) stats.withEmailNormalized++;
    if (mapped.linkedin_url) stats.withLinkedin++;
    if (mapped.phone) stats.withPhone++;
  }
  stats.uniqueUserIds = out.length;
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
  const { rows, stats } = parseContactsXlsx(file, importBatchId);
  const tParse = Date.now() - t0;
  console.log(`✓ parse en ${tParse}ms`);
  console.log('📊 Stats parse :');
  console.log(`   totalRows            : ${stats.totalRows}`);
  console.log(`   uniqueUserIds        : ${stats.uniqueUserIds}`);
  console.log(`   skippedNoUserId      : ${stats.skippedNoUserId}`);
  console.log(`   skippedDuplicates    : ${stats.skippedDuplicates}`);
  console.log(`   withEmail            : ${stats.withEmail}`);
  console.log(`   withEmailNormalized  : ${stats.withEmailNormalized}`);
  console.log(`   withLinkedin         : ${stats.withLinkedin}`);
  console.log(`   withPhone            : ${stats.withPhone}`);

  if (dryRun) {
    console.log('\n🔍 Sample 3 premieres rows mappees :');
    for (const r of rows.slice(0, 3)) {
      console.log(JSON.stringify({ ...r, raw_data: '<omitted>' }, null, 2));
    }
    console.log('\n✅ DRY RUN OK — pas d ecriture DB.');
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env.local');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log('\n→ Upsert vers connectonair_directory_contacts…');
  let upserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    // Cast `as never[]` : types Supabase pas encore regen post-0080.
    // A retirer apres pnpm db:types.
    const { error } = await supabase
      .from('connectonair_directory_contacts')
      .upsert(chunk as never[], {
        onConflict: 'source_user_id',
        ignoreDuplicates: false,
      });
    if (error) {
      errors += chunk.length;
      console.error(`✗ batch ${i}-${i + chunk.length} : ${error.message}`);
    } else {
      upserted += chunk.length;
      if (upserted % 2500 === 0 || upserted === rows.length) {
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

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
