/**
 * Resout le shortlink Canva https://canva.link/md26plan vers son URL longue
 * canonique (canva.com/design/.../view) + suffixe `?embed`, et stocke le
 * resultat dans `app_settings.canva_md26_plan_url`.
 *
 * A executer une fois apres la migration 0019 :
 *   pnpm canva:resolve
 *
 * Idempotent : reexecutable a tout moment si Canva change l'URL longue
 * (extremement rare car le DESIGN_ID/HASH sont stables).
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveCanvaShortlink, CANVA_PLAN_SETTINGS_KEY } from '../src/lib/canva/resolve-shortlink';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SHORTLINK = 'https://canva.link/md26plan';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

async function main() {
  console.log(`\n→ Resolving Canva shortlink: ${SHORTLINK}`);
  const { resolvedUrl, embedUrl, hops } = await resolveCanvaShortlink(SHORTLINK);
  console.log(`  ✓ Resolved in ${hops} hop(s):`);
  console.log(`    canonical: ${resolvedUrl}`);
  console.log(`    embed:     ${embedUrl}`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: CANVA_PLAN_SETTINGS_KEY,
      value: embedUrl,
      description:
        'URL longue Canva (resolved depuis https://canva.link/md26plan) + ?embed pour iframe. Mise a jour via pnpm canva:resolve.',
      category: 'general',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );

  if (error) {
    console.error(`  ✗ Failed to upsert app_settings:`, error);
    process.exit(1);
  }

  console.log(`\n✓ app_settings["${CANVA_PLAN_SETTINGS_KEY}"] updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
