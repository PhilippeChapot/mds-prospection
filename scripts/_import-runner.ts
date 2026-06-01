/**
 * P5.x.ExternalEvents — runner CLI partage pour les 4 scripts import-*.
 *
 * Cree un client Supabase service-role depuis .env.local et appelle
 * importNormalized. Imprime un rapport stats lisible.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { importNormalized } from '../src/lib/external-events/importer';
import type { NormalizedImport, ImportStats } from '../src/lib/external-events/types';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

const cliClient: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function runImport(data: NormalizedImport, opts: { dryRun: boolean }) {
  console.log(`[${data.source}] starting ${opts.dryRun ? 'DRY-RUN' : 'REAL'} import...`);
  const stats: ImportStats = await importNormalized(data, {
    ...opts,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: cliClient as any,
  });
  printStats(stats);
  return stats;
}

function printStats(stats: ImportStats) {
  console.log('');
  console.log(`================================================`);
  console.log(`Import ${stats.source} — ${stats.dryRun ? 'DRY-RUN' : 'REAL'}`);
  console.log(`================================================`);
  console.log(`  matched companies   : ${stats.matchedCompanies}`);
  console.log(`  created companies   : ${stats.createdCompanies}`);
  console.log(`  matched contacts    : ${stats.matchedContacts}`);
  console.log(`  created contacts    : ${stats.createdContacts}`);
  console.log(`  enriched companies  : ${stats.enrichedCompanies}`);
  console.log(`  errors              : ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log('');
    console.log('Erreurs :');
    for (const e of stats.errors.slice(0, 20)) {
      console.log(`  - ${e.rawName}: ${e.message}`);
    }
  }
  console.log('');
}
