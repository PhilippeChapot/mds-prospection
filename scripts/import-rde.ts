/**
 * P5.x.ExternalEvents — import RDE 2026 (Radio Days Europe).
 * Usage : pnpm tsx scripts/import-rde.ts [--dry-run] [--file PATH]
 *
 * ⚠️ Tous les contacts importes ont emailConfidence='low' (emails
 * deduits par pattern prenom.nom, non verifies). Les contacts crees
 * auront marketing_consent=false par defaut -> jamais cibles
 * automatiquement par une campagne Brevo.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRdeFile } from '../src/lib/external-events/adapters/rde';
import { runImport } from './_import-runner';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const DEFAULT_FILE =
  '/Users/mbprophilippechapot/Library/CloudStorage/GoogleDrive-philippe.chapot@gmail.com/Mon Drive/MEDIADAYS/MD PROSPECTION/Exposants_RDE2026_emails_déduits.xlsx';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? args[fileIdx + 1] : DEFAULT_FILE;

  console.log(`[rde] reading ${file}`);
  const data = readRdeFile(file);
  const contactCount = data.companies.reduce((s, c) => s + c.contacts.length, 0);
  console.log(`[rde] parsed ${data.companies.length} companies, ${contactCount} contacts`);
  await runImport(data, { dryRun });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
