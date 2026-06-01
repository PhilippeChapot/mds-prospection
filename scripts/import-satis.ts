/**
 * P5.x.ExternalEvents — import SATIS 2025.
 * Usage : pnpm tsx scripts/import-satis.ts [--dry-run] [--file PATH]
 *
 * Enrichit les companies existantes (website, country, description)
 * sans ecraser les valeurs non-vides. Cree les manquantes en unverified.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSatisFile } from '../src/lib/external-events/adapters/satis';
import { runImport } from './_import-runner';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/MD PROSPECTION/Exposants_SATIS_2025.xlsx';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;

  console.log(`[satis] reading ${file}`);
  const data = readSatisFile(file);
  const contactCount = data.companies.reduce((s, c) => s + c.contacts.length, 0);
  console.log(`[satis] parsed ${data.companies.length} companies, ${contactCount} contacts`);
  await runImport(data, { dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
