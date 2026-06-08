/**
 * P5.x.PhoneEnrichmentDisplay-bis — enrichissement phones depuis le
 * fichier curated `Prospection_MDS2026_v2.xlsx` (Google Drive Phil).
 *
 * Source 2 / 2 (complementaire au script CoA enrich-phones-from-coa.ts) :
 *   - Sheet "Societes" (864 rows) : col 5 "Telephone standard" (~533 phones).
 *   - Sheet "Contacts"  (723 rows) : col 5 "Telephone direct" (~15 phones).
 *
 * Pre-requis : copier le xlsx dans data/imports/ (gitignored) avant run.
 *   mkdir -p data/imports
 *   cp "/Users/.../Prospection_MDS2026_v2.xlsx" data/imports/
 *
 * Usage :
 *   pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts --dry-run
 *   pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts
 *   pnpm tsx scripts/enrich-phones-from-prospection-xlsx.ts --file PATH
 *
 * Doctrines :
 *   - UPDATE WHERE phone IS NULL only — jamais d ecrasement.
 *   - Matching company : domain (priorite) -> name normalise (fallback).
 *   - Matching contact : email LOWER+TRIM.
 *   - Source tag : 'prospection_xlsx_v2' (track origine).
 *   - Audit log kind=phones_enriched.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeNameJs } from '../src/lib/external-events/normalize-query';
import { normalizePhoneE164 } from '../src/lib/utils/phone-format';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE = path.join(projectRoot, 'data', 'imports', 'Prospection_MDS2026_v2.xlsx');
const SOURCE_TAG = 'prospection_xlsx_v2';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileIdx = args.indexOf('--file');
const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;

/**
 * Hotfix CI : init Supabase lazy via getter au lieu de top-level. Les
 * tests vitest importent parseSocietes/parseContacts depuis ce script
 * (pure functions xlsx parsing) — en CI les env vars Supabase ne sont
 * pas définies, donc le top-level `process.exit(1)` faisait tomber la
 * suite de tests. Lazy init = exit déclenché seulement au vrai run du
 * script (main()), pas au load module.
 */
function getSupabaseOrExit(): ReturnType<typeof createClient> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis dans .env.local');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Helpers ───────────────────────────────────────────────────────────

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // Email : prendre la partie apres @.
  if (s.includes('@')) {
    const domain = s.split('@')[1]?.trim().toLowerCase();
    return domain || null;
  }
  // URL : parser via URL constructor avec fallback https://.
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

function cellToString(cell: unknown): string | null {
  if (cell === null || cell === undefined) return null;
  const s = String(cell).trim();
  return s.length === 0 || s === 'NULL' ? null : s;
}

// ─── Parsing xlsx ──────────────────────────────────────────────────────

export type SocieteRow = {
  name: string;
  url: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
};

export type ContactRow = {
  email: string;
  email_normalized: string;
  phone_raw: string | null;
  phone_e164: string | null;
};

/**
 * Parse la sheet "Societes" (header rows[0], data rows[1+]).
 * Cols : 0=Société, 4=URL, 5=Téléphone standard, 6=Email générique.
 */
export function parseSocietes(filePath: string): SocieteRow[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets['Sociétés'];
  if (!ws) throw new Error(`Sheet "Sociétés" introuvable dans ${filePath}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const out: SocieteRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = cellToString(row[0]);
    if (!name) continue;
    const phoneRaw = cellToString(row[5]);
    out.push({
      name,
      url: cellToString(row[4]),
      email: cellToString(row[6]),
      phone_raw: phoneRaw,
      phone_e164: phoneRaw ? normalizePhoneE164(phoneRaw) : null,
    });
  }
  return out;
}

/**
 * Parse la sheet "Contacts" (header rows[0], data rows[1+]).
 * Cols : 4=Email direct, 5=Téléphone direct.
 */
export function parseContacts(filePath: string): ContactRow[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets['Contacts'];
  if (!ws) throw new Error(`Sheet "Contacts" introuvable dans ${filePath}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const out: ContactRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const email = cellToString(row[4]);
    if (!email || !email.includes('@')) continue;
    const phoneRaw = cellToString(row[5]);
    out.push({
      email,
      email_normalized: email.trim().toLowerCase(),
      phone_raw: phoneRaw,
      phone_e164: phoneRaw ? normalizePhoneE164(phoneRaw) : null,
    });
  }
  return out;
}

// ─── Stats type ────────────────────────────────────────────────────────

interface Stats {
  companies: {
    rowsTotal: number;
    rowsWithPhone: number;
    parsedOk: number;
    parsedFail: number;
    matchedByDomain: number;
    matchedByName: number;
    notFound: number;
    skippedExistingPhone: number;
    updated: number;
    notFoundExamples: string[];
  };
  contacts: {
    rowsTotal: number;
    rowsWithPhone: number;
    parsedOk: number;
    parsedFail: number;
    matchedByEmail: number;
    notFound: number;
    skippedExistingPhone: number;
    updated: number;
  };
}

// ─── Run principal ─────────────────────────────────────────────────────

async function main() {
  // Hotfix CI : init Supabase lazy (cf. getSupabaseOrExit).
  const supabase = getSupabaseOrExit();

  console.log(dryRun ? '🔍 DRY RUN — aucun UPDATE DB' : '⚠️  LIVE RUN — UPDATE DB');
  console.log(`📂 file = ${file}`);
  console.log(`🏷️  source tag = ${SOURCE_TAG}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = supabase as any;
  const stats: Stats = {
    companies: {
      rowsTotal: 0,
      rowsWithPhone: 0,
      parsedOk: 0,
      parsedFail: 0,
      matchedByDomain: 0,
      matchedByName: 0,
      notFound: 0,
      skippedExistingPhone: 0,
      updated: 0,
      notFoundExamples: [],
    },
    contacts: {
      rowsTotal: 0,
      rowsWithPhone: 0,
      parsedOk: 0,
      parsedFail: 0,
      matchedByEmail: 0,
      notFound: 0,
      skippedExistingPhone: 0,
      updated: 0,
    },
  };

  // ─── Phase A : Companies ───
  console.log('→ Phase A/B : enrichissement companies.phone depuis sheet "Societes"…');
  const societes = parseSocietes(file);
  stats.companies.rowsTotal = societes.length;

  for (const s of societes) {
    if (!s.phone_raw) continue;
    stats.companies.rowsWithPhone++;
    if (!s.phone_e164) {
      stats.companies.parsedFail++;
      continue;
    }
    stats.companies.parsedOk++;

    // Match priorite 1 : domaine (URL ou email).
    const domainFromUrl = extractDomain(s.url);
    const domainFromEmail = extractDomain(s.email);
    let companyId: string | null = null;
    let matchedThisRow: 'domain' | 'name' | null = null;
    let alreadyHadPhone = false;

    for (const domain of [domainFromUrl, domainFromEmail].filter((d): d is string => !!d)) {
      const { data: rows } = await supa
        .from('companies')
        .select('id, phone, website, primary_domain')
        .or(`primary_domain.eq.${domain},website.ilike.%${domain}%`)
        .limit(1);
      if (rows && rows.length > 0) {
        matchedThisRow = 'domain';
        if (rows[0].phone) {
          alreadyHadPhone = true;
        } else {
          companyId = rows[0].id;
        }
        break;
      }
    }

    // Match priorite 2 : nom normalise (seulement si pas matche par domain).
    if (!matchedThisRow) {
      const nameNorm = normalizeNameJs(s.name);
      if (nameNorm) {
        const { data: rows } = await supa
          .from('companies')
          .select('id, phone')
          .eq('name_normalized', nameNorm)
          .limit(1);
        if (rows && rows.length > 0) {
          matchedThisRow = 'name';
          if (rows[0].phone) {
            alreadyHadPhone = true;
          } else {
            companyId = rows[0].id;
          }
        }
      }
    }

    // Comptage stats par row.
    if (matchedThisRow === 'domain') stats.companies.matchedByDomain++;
    else if (matchedThisRow === 'name') stats.companies.matchedByName++;
    else {
      stats.companies.notFound++;
      if (stats.companies.notFoundExamples.length < 10) {
        stats.companies.notFoundExamples.push(s.name);
      }
      continue;
    }

    if (alreadyHadPhone) {
      stats.companies.skippedExistingPhone++;
      continue;
    }
    if (!companyId) continue;

    if (dryRun) {
      stats.companies.updated++;
      continue;
    }

    const { error } = await supa
      .from('companies')
      .update({ phone: s.phone_e164, phone_source: SOURCE_TAG })
      .eq('id', companyId)
      .is('phone', null);
    if (!error) {
      stats.companies.updated++;
    } else {
      console.warn(`✗ company ${companyId} : ${error.message}`);
    }
  }

  console.log(
    `   rowsWithPhone=${stats.companies.rowsWithPhone} parsedOk=${stats.companies.parsedOk} parsedFail=${stats.companies.parsedFail}`,
  );
  console.log(
    `   matchedDomain=${stats.companies.matchedByDomain} matchedName=${stats.companies.matchedByName} notFound=${stats.companies.notFound} skippedExisting=${stats.companies.skippedExistingPhone}`,
  );
  console.log(`   → ${dryRun ? 'WOULD UPDATE' : 'UPDATED'} ${stats.companies.updated} companies\n`);

  // ─── Phase B : Contacts ───
  console.log('→ Phase B/B : enrichissement contacts.phone_mobile depuis sheet "Contacts"…');
  const contacts = parseContacts(file);
  stats.contacts.rowsTotal = contacts.length;

  for (const c of contacts) {
    if (!c.phone_raw) continue;
    stats.contacts.rowsWithPhone++;
    if (!c.phone_e164) {
      stats.contacts.parsedFail++;
      continue;
    }
    stats.contacts.parsedOk++;

    const { data: rows } = await supa
      .from('contacts')
      .select('id, phone, phone_mobile')
      .eq('email', c.email_normalized)
      .limit(1);
    if (!rows || rows.length === 0) {
      // Tentative case-insensitive (les emails MDS sont parfois UPPER en DB legacy).
      const { data: ciRows } = await supa
        .from('contacts')
        .select('id, phone, phone_mobile')
        .ilike('email', c.email_normalized)
        .limit(1);
      if (!ciRows || ciRows.length === 0) {
        stats.contacts.notFound++;
        continue;
      }
      rows.push(...ciRows);
    }
    stats.contacts.matchedByEmail++;
    const target = rows[0];
    const updates: Record<string, unknown> = {};
    if (!target.phone_mobile) {
      updates.phone_mobile = c.phone_e164;
      updates.phone_mobile_source = SOURCE_TAG;
    }
    if (!target.phone) {
      updates.phone = c.phone_e164;
    }
    if (Object.keys(updates).length === 0) {
      stats.contacts.skippedExistingPhone++;
      continue;
    }
    if (dryRun) {
      stats.contacts.updated++;
      continue;
    }
    const { error } = await supa.from('contacts').update(updates).eq('id', target.id);
    if (!error) {
      stats.contacts.updated++;
    } else {
      console.warn(`✗ contact ${target.id} : ${error.message}`);
    }
  }

  console.log(
    `   rowsWithPhone=${stats.contacts.rowsWithPhone} parsedOk=${stats.contacts.parsedOk} parsedFail=${stats.contacts.parsedFail}`,
  );
  console.log(
    `   matchedEmail=${stats.contacts.matchedByEmail} notFound=${stats.contacts.notFound} skippedExisting=${stats.contacts.skippedExistingPhone}`,
  );
  console.log(`   → ${dryRun ? 'WOULD UPDATE' : 'UPDATED'} ${stats.contacts.updated} contacts\n`);

  // ─── Audit log ───
  if (!dryRun) {
    await supa.from('audit_log').insert({
      user_id: null,
      entity_type: 'companies',
      entity_id: null,
      action: 'update',
      after: {
        kind: 'phones_enriched',
        source: SOURCE_TAG,
        companies_scanned: stats.companies.rowsWithPhone,
        companies_updated: stats.companies.updated,
        contacts_scanned: stats.contacts.rowsWithPhone,
        contacts_updated: stats.contacts.updated,
      },
    });
  }

  // ─── Resume final ───
  console.log('📈 Final stats :');
  console.log(JSON.stringify(stats, null, 2));
  if (stats.companies.notFoundExamples.length > 0) {
    console.log('\n🔎 Sample "not found in DB" (10 max) :');
    for (const s of stats.companies.notFoundExamples) console.log(`  - ${s}`);
  }
  console.log(
    dryRun ? '\n🔍 DRY RUN OK — relance sans --dry-run pour appliquer.' : '\n✅ ENRICHMENT OK.',
  );
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
