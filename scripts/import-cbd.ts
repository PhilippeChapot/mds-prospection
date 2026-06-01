/**
 * P5.x.ExternalEvents — import CBD 25 (Broadcast Days).
 * Usage : pnpm tsx scripts/import-cbd.ts [--dry-run] [--file PATH]
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readCbdFile } from '../src/lib/external-events/adapters/cbd';
import { runImport } from './_import-runner';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/MD PROSPECTION/CBD 25  Exposants.xlsx';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;

  console.log(`[cbd] reading ${file}`);
  const data = readCbdFile(file);
  const contactCount = data.companies.reduce((s, c) => s + c.contacts.length, 0);
  console.log(`[cbd] parsed ${data.companies.length} companies, ${contactCount} contacts`);
  await runImport(data, { dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
