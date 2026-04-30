import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { admin, getActiveSeasonId, PROJECT_ROOT } from './_client';

/**
 * Seed des 47 exposants Paris Radio Show 2026 depuis le CSV.
 *
 * Le CSV est riche en metadonnees (pole_code, primary_domain, country),
 * donc on cree EN PARALLELE :
 *  - 47 lignes dans `prs_2026_exhibitors` (liste de reference)
 *  - 47 lignes dans `companies` (categorie 'prs_exhibitor', was_prs_2026_exhibitor=true)
 *  - le matched_company_id est pose pour relier les deux
 *
 * Idempotent : ON CONFLICT (season_id, company_name_normalized) -> update.
 */

interface CsvRow {
  company_name: string;
  company_name_normalized: string;
  primary_domain: string;
  pole_code: string;
  sub_sector: string;
  country: string;
  source: string;
}

const COUNTRY_MAP: Record<string, string> = {
  france: 'FR',
  belgique: 'BE',
  belgium: 'BE',
  'grande bretagne': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  'united kingdom': 'GB',
  allemagne: 'DE',
  germany: 'DE',
  espagne: 'ES',
  spain: 'ES',
  italie: 'IT',
  italy: 'IT',
  'pays-bas': 'NL',
  netherlands: 'NL',
  suisse: 'CH',
  switzerland: 'CH',
  'etats-unis': 'US',
  'états-unis': 'US',
  usa: 'US',
  'united states': 'US',
  canada: 'CA',
  irlande: 'IE',
  ireland: 'IE',
  luxembourg: 'LU',
  portugal: 'PT',
  danemark: 'DK',
  denmark: 'DK',
  suede: 'SE',
  suède: 'SE',
  sweden: 'SE',
  norvege: 'NO',
  norvège: 'NO',
  norway: 'NO',
};

function toIsoCountry(label: string | null | undefined): string | null {
  if (!label) return null;
  const key = label.trim().toLowerCase();
  return COUNTRY_MAP[key] ?? null;
}

const VALID_POLE_CODES = new Set([
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
  'INCONNU',
]);

async function main() {
  const seasonId = await getActiveSeasonId();
  console.log(`→ Seeding 47 PRS exhibitors for season ${seasonId}…`);

  // 1. Charger le CSV
  const csvPath = path.join(PROJECT_ROOT, 'scripts/seed/data/seed-prs-2026-exhibitors.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV introuvable : ${csvPath}`);
  }
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    console.warn('CSV parse warnings:', parsed.errors);
  }
  const rows = parsed.data.filter((r) => r.company_name?.trim());
  console.log(`  Lignes utiles dans le CSV : ${rows.length}`);

  // 2. Charger la map { pole_code -> id } pour le FK companies.pole_id
  const { data: poles, error: polesErr } = await admin.from('poles').select('id, code');
  if (polesErr || !poles) throw polesErr ?? new Error('No poles found');
  const poleIdByCode = new Map(poles.map((p) => [p.code, p.id]));

  let companiesCreated = 0;
  let companiesUpdated = 0;
  let prsCreated = 0;
  let prsUpdated = 0;
  let prsSkipped = 0;

  for (const row of rows) {
    const name = row.company_name.trim();
    const nameNormalized = (row.company_name_normalized || name).trim().toLowerCase();
    const domain = row.primary_domain?.trim() || null;
    const poleCode = VALID_POLE_CODES.has(row.pole_code?.trim()) ? row.pole_code.trim() : 'INCONNU';
    const poleId = poleIdByCode.get(poleCode);
    const country = toIsoCountry(row.country);

    // 2a. Upsert company
    const { data: existingCo } = await admin
      .from('companies')
      .select('id')
      .ilike('name_normalized', nameNormalized)
      .maybeSingle();

    let companyId: string;
    if (existingCo) {
      companyId = existingCo.id;
      const { error } = await admin
        .from('companies')
        .update({
          name,
          name_normalized: nameNormalized,
          primary_domain: domain,
          country,
          pole_id: poleId ?? null,
          pole_classified_by: 'manual',
          pole_classified_at: new Date().toISOString(),
          category: 'prs_exhibitor',
          was_prs_2026_exhibitor: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);
      if (error) throw error;
      companiesUpdated += 1;
    } else {
      const { data, error } = await admin
        .from('companies')
        .insert({
          name,
          name_normalized: nameNormalized,
          primary_domain: domain,
          country,
          pole_id: poleId ?? null,
          pole_classified_by: 'manual',
          pole_classified_at: new Date().toISOString(),
          pole_confidence: 1.0,
          category: 'prs_exhibitor',
          was_prs_2026_exhibitor: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      companyId = data.id;
      companiesCreated += 1;
    }

    // 2b. Upsert prs_2026_exhibitors
    const { data: existingPrs } = await admin
      .from('prs_2026_exhibitors')
      .select('id')
      .eq('season_id', seasonId)
      .eq('company_name_normalized', nameNormalized)
      .maybeSingle();

    if (existingPrs) {
      const { error } = await admin
        .from('prs_2026_exhibitors')
        .update({
          company_name: name,
          matched_company_id: companyId,
          source: 'xlsx_seed',
        })
        .eq('id', existingPrs.id);
      if (error) throw error;
      prsUpdated += 1;
    } else {
      const { error } = await admin.from('prs_2026_exhibitors').insert({
        season_id: seasonId,
        company_name: name,
        company_name_normalized: nameNormalized,
        matched_company_id: companyId,
        source: 'xlsx_seed',
      });
      if (error) {
        console.error(`  Failed insert prs row "${name}":`, error.message);
        prsSkipped += 1;
        continue;
      }
      prsCreated += 1;
    }
  }

  console.log(
    `  ✓ companies : created=${companiesCreated}, updated=${companiesUpdated} (total=${rows.length})`,
  );
  console.log(
    `  ✓ prs_2026_exhibitors : created=${prsCreated}, updated=${prsUpdated}, skipped=${prsSkipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
