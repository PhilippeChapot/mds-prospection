/**
 * P6.x.2a — seed initial des stands Salle Le Nôtre (Carrousel du Louvre).
 *
 * 69 stands au total :
 *   - 15 stands à 6.0 m² (L01..L15)
 *   - 54 stands à 9.0 m² (L16..L69)
 *
 * Pôle recommandé : non assigné (les 5 pôles MDS Solutions + Paris Radio Show
 * cohabitent dans Le Nôtre). Phil affecte un pôle au cas par cas via l'UI
 * admin si besoin, ou via import CSV ultérieur.
 *
 * Idempotent : UPSERT sur (salle, number). Ré-exécutable sans casser les
 * stands déjà assignés (les colonnes prospect_id + status ne sont pas
 * écrasées si la ligne existe déjà — on UPDATE uniquement les champs
 * "métadonnées" via on conflict do nothing).
 *
 * Usage :  pnpm tsx scripts/seed-stands.ts
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildLeNotreSeeds } from '../src/lib/admin/stands/seeds';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  const seeds = buildLeNotreSeeds();
  console.log(`[seed-stands] Preparing ${seeds.length} stands for Le Nôtre…`);

  // Idempotent : on lit l'existant et n'insère que les stands manquants.
  const numbers = seeds.map((s) => s.number);
  const { data: existing, error: lookupErr } = await supabase
    .from('stands')
    .select('number')
    .eq('salle', 'le_notre')
    .in('number', numbers);
  if (lookupErr) {
    throw new Error(`Failed to read existing stands: ${lookupErr.message}`);
  }
  const existingNumbers = new Set((existing ?? []).map((r) => r.number));
  const toInsert = seeds.filter((s) => !existingNumbers.has(s.number));

  if (toInsert.length === 0) {
    console.log(`[seed-stands] All ${seeds.length} Le Nôtre stands already exist — nothing to do.`);
    return;
  }

  const { error: insertErr } = await supabase.from('stands').insert(toInsert);
  if (insertErr) {
    throw new Error(`Insert failed: ${insertErr.message}`);
  }

  console.log(
    `[seed-stands] ✓ Inserted ${toInsert.length} new stands (${existingNumbers.size} already existed). Total Le Nôtre = ${seeds.length}.`,
  );
}

// Run only when invoked directly (not when imported by tests)
const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed-stands.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
