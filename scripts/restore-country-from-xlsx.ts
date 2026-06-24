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
import {
  buildNameCountryIndex,
  buildDomainCountryIndex,
  matchCountryCascade,
  type CountrySourceV2,
} from '../src/lib/admin/companies/restore-country';

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
  // 1. Index Prospection_v2 (nom + domaine → pays).
  const prospRows = readSheet(PROSPECTION_PATH, 'Sociétés');
  const prospName = (r: Row) =>
    pick(r, ['Société', 'Societe', 'Nom', 'Raison sociale', 'Entreprise', 'Company']);
  const prospCountry = (r: Row) => pick(r, ['Pays', 'Country']);
  const prospUrl = (r: Row) => pick(r, ['URL', 'Url', 'Site web', 'Site', 'Website', 'Domaine']);
  const prospectionByName = buildNameCountryIndex(
    prospRows.map((r) => ({ names: [prospName(r)], country: prospCountry(r) })),
  );
  const prospectionByDomain = buildDomainCountryIndex(
    prospRows.map((r) => ({ url: prospUrl(r), country: prospCountry(r) })),
  );
  console.log(
    `Index Prospection_v2 : ${prospectionByName.size} noms, ${prospectionByDomain.size} domaines.`,
  );

  // 2. Index ConnectOnAir (raison_social/abrege/sigle + url → pays).
  const coaRows = readSheet(CONNECTONAIR_PATH);
  const coaCountry = (r: Row) => pick(r, ['pays', 'country']);
  const coaUrl = (r: Row) => pick(r, ['url', 'site_web', 'website', 'URL', 'site']);
  const connectOnAirByName = buildNameCountryIndex(
    coaRows.map((r) => ({
      names: [
        pick(r, ['raison_social', 'raison sociale']),
        pick(r, ['abrege', 'abrégé']),
        pick(r, ['sigle']),
      ],
      country: coaCountry(r),
    })),
  );
  const connectOnAirByDomain = buildDomainCountryIndex(
    coaRows.map((r) => ({ url: coaUrl(r), country: coaCountry(r) })),
  );
  console.log(
    `Index ConnectOnAir : ${coaRows.length} rows → ${connectOnAirByName.size} noms, ${connectOnAirByDomain.size} domaines.`,
  );

  const idx = { prospectionByDomain, connectOnAirByDomain, prospectionByName, connectOnAirByName };

  // 3. Sociétés à restaurer (avec domaine pour la stratégie 1).
  const { data: rows, error } = await db
    .from('companies')
    .select('id, name, primary_domain')
    .is('country', null);
  if (error) {
    console.error('SELECT failed:', error.message);
    process.exit(1);
  }
  const companies = rows ?? [];
  console.log(
    `${companies.length} sociétés à restaurer (country IS NULL).${APPLY ? '' : ' [DRY-RUN]'}`,
  );

  const bySource: Record<CountrySourceV2, number> = {
    prospection_v2_domain: 0,
    connectonair_domain: 0,
    prospection_v2_name: 0,
    connectonair_name: 0,
  };
  const stats = { processed: 0, updated: 0, skipped: 0 };
  let i = 0;
  for (const c of companies) {
    stats.processed += 1;
    i += 1;
    const match = matchCountryCascade(
      { name: c.name as string, domain: c.primary_domain as string | null },
      idx,
    );
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
    bySource[match.source] += 1;
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
    [
      `Terminé. processed=${stats.processed}`,
      `matched_prospection_domain=${bySource.prospection_v2_domain}`,
      `matched_prospection_name=${bySource.prospection_v2_name}`,
      `matched_connectonair_domain=${bySource.connectonair_domain}`,
      `matched_connectonair_name=${bySource.connectonair_name}`,
      `updated=${stats.updated}`,
      `skipped=${stats.skipped}${APPLY ? '' : ' [DRY-RUN]'}`,
    ].join(' '),
  );
}

void main();
