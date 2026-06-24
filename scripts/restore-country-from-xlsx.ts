/**
 * P5.x.RestoreCountryFromXlsx — restaure le pays des sociétés `country IS NULL`
 * en matchant leur nom contre 2 xlsx sources (valeurs réelles, 0$ Haiku).
 *
 *   1. Prospection_MDS2026_v2.xlsx (sheet "Sociétés", col Pays) — prioritaire
 *   2. ConnectOnAir-export-2026-06.xlsx (raison_social/abrege/sigle + pays)
 *
 * Lancement (Phil) :
 *   set -a && source .env.local && set +a && pnpm tsx scripts/restore-country-from-xlsx.ts          # DRY-RUN
 *   set -a && source .env.local && set +a && pnpm tsx scripts/restore-country-from-xlsx.ts --apply   # écrit
 *
 * Override paths : --prospection <path> --connectonair <path>
 * Fallback : les non-matchés peuvent ensuite passer par infer-missing-country.ts (Haiku).
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeCountryToIso } from '../src/lib/format/country';
import { buildNameCountryIndex, matchCountry } from '../src/lib/admin/companies/restore-country';

const HOME = process.env.HOME ?? '/Users/mbprophilippechapot';
const DRIVE = `${HOME}/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS`;

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const APPLY = process.argv.includes('--apply');
const PROSPECTION_PATH =
  argValue('--prospection') ?? `${DRIVE}/MD PROSPECTION/Prospection_MDS2026_v2.xlsx`;
const CONNECTONAIR_PATH =
  argValue('--connectonair') ?? `${DRIVE}/COWORK/ConnectOnAir-export-2026-06.xlsx`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  process.exit(1);
}
const db = createClient(url, key);

type Row = Record<string, unknown>;

/** Lit une feuille xlsx (par nom, fallback 1re feuille) → tableau d'objets. */
function readSheet(path: string, preferredSheet?: string): Row[] {
  const wb = XLSX.readFile(path);
  const sheetName =
    (preferredSheet && wb.SheetNames.find((s) => s === preferredSheet)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });
}

/** Valeur de la 1re colonne (clé case-insensitive) parmi des candidats. */
function pick(row: Row, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const k = keys.find((kk) => kk.toLowerCase().trim() === cand.toLowerCase());
    if (k) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
  }
  return null;
}

async function main() {
  // 1. Index Prospection_v2 (nom → pays).
  const prospRows = readSheet(PROSPECTION_PATH, 'Sociétés');
  const prospectionIndex = buildNameCountryIndex(
    prospRows.map((r) => ({
      names: [pick(r, ['Société', 'Societe', 'Nom', 'Raison sociale', 'Entreprise', 'Company'])],
      country: pick(r, ['Pays', 'Country']),
    })),
  );
  console.log(`Index Prospection_v2 : ${prospectionIndex.size} entrées.`);

  // 2. Index ConnectOnAir (raison_social / abrege / sigle → pays).
  const coaRows = readSheet(CONNECTONAIR_PATH);
  const connectOnAirIndex = buildNameCountryIndex(
    coaRows.map((r) => ({
      names: [
        pick(r, ['raison_social', 'raison sociale']),
        pick(r, ['abrege', 'abrégé']),
        pick(r, ['sigle']),
      ],
      country: pick(r, ['pays', 'country']),
    })),
  );
  console.log(`Index ConnectOnAir : ${coaRows.length} rows → ${connectOnAirIndex.size} aliases.`);

  // 3. Sociétés à restaurer.
  const { data: rows, error } = await db.from('companies').select('id, name').is('country', null);
  if (error) {
    console.error('SELECT failed:', error.message);
    process.exit(1);
  }
  const companies = rows ?? [];
  console.log(
    `${companies.length} sociétés à restaurer (country IS NULL).${APPLY ? '' : ' [DRY-RUN]'}`,
  );

  const stats = { processed: 0, prospection: 0, connectonair: 0, updated: 0, skipped: 0 };
  let i = 0;
  for (const c of companies) {
    stats.processed += 1;
    i += 1;
    const match = matchCountry(c.name as string, prospectionIndex, connectOnAirIndex);
    if (!match) {
      stats.skipped += 1;
      continue;
    }
    const iso = normalizeCountryToIso(match.rawCountry);
    if (!iso) {
      stats.skipped += 1;
      console.log(`  [${i}] ${c.name} → "${match.rawCountry}" non-mappable en ISO (skip)`);
      continue;
    }
    if (match.source === 'prospection_v2') stats.prospection += 1;
    else stats.connectonair += 1;
    console.log(`  [${i}] ${c.name} → ${iso} (source: ${match.source})`);

    if (!APPLY) {
      stats.updated += 1;
      continue;
    }
    const { error: updErr } = await db
      .from('companies')
      .update({ country: iso })
      .eq('id', c.id as string);
    if (updErr) {
      stats.skipped += 1;
      console.error(`  ⚠️ update failed ${c.id}: ${updErr.message}`);
      continue;
    }
    await db.from('audit_log').insert({
      user_id: null,
      action: 'sync_manual',
      entity_type: 'companies',
      entity_id: c.id as string,
      before: { country: null },
      after: { kind: 'country_restored_xlsx', country: iso, source: match.source },
    });
    stats.updated += 1;
  }

  console.log(
    `Terminé. processed=${stats.processed} matched_prospection=${stats.prospection} matched_connectonair=${stats.connectonair} updated=${stats.updated} skipped=${stats.skipped}${APPLY ? '' : ' [DRY-RUN]'}`,
  );
}

void main();
