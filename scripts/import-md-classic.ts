/**
 * P5.x.ExternalEvents — import MD Classic (Havas).
 *
 * Usage :
 *   pnpm tsx scripts/import-md-classic.ts --dry-run   (rapport sans ecriture)
 *   pnpm tsx scripts/import-md-classic.ts             (import reel)
 *
 * Options :
 *   --file PATH   Override le chemin par defaut (LISTING_EXPOSANTS_MD2023-2026/MEDIADAYS 2026.xlsx).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readMdClassicFile } from '../src/lib/external-events/adapters/md-classic';
import { runImport } from './_import-runner';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/MD PROSPECTION/LISTING_EXPOSANTS_MD2023-2026 /MEDIADAYS 2026.xlsx';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;

  console.log(`[md-classic] reading ${file}`);
  const data = readMdClassicFile(file);
  console.log(`[md-classic] parsed ${data.companies.length} companies`);
  await runImport(data, { dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
