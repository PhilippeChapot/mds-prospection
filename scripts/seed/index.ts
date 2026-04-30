/**
 * Seed orchestrator — runs all seeds in order.
 * Usage : pnpm seed:all
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const seedDir = path.dirname(__filename);

const SCRIPTS = [
  '01_season.ts',
  '02_pricing_tiers.ts',
  '03_addon_options.ts',
  '04_app_settings.ts',
  '05_prs_exhibitors.ts',
];

for (const script of SCRIPTS) {
  console.log(`\n=== Running ${script} ===`);
  const result = spawnSync('pnpm', ['exec', 'tsx', path.join(seedDir, script)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`✗ ${script} failed (exit ${result.status})`);
    process.exit(1);
  }
}

console.log('\n✓ All seeds applied successfully.');
