/**
 * P6.x.5-octies — backfill prospects.quote_items pour les prospects
 * historiques (convertis avant ce milestone) qui ont une sélection wizard
 * captée (pack_code != 'A_DEFINIR' OU selected_addon_ids non-vide) mais
 * un quote_items vide.
 *
 * Idempotent : ne touche pas les prospects qui ont déjà des quote_items.
 *
 * Usage :  pnpm tsx scripts/backfill-quote-items.ts
 * Options :
 *   --dry        : log uniquement, n'écrit pas en DB
 *   --limit N    : limite à N prospects (défaut : aucun, traite tout)
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hydrateQuoteItemsFromSelection } from '../src/lib/admin/prospects/hydrate-quote-items';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

interface ProspectCandidate {
  id: string;
  pack_code: string | null;
  selected_addon_ids: string[];
  events_interest: string[];
  company: { category: string | null } | null;
  quote_items: unknown;
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;

  console.log(`[backfill] start dry=${dryRun} limit=${limit ?? '∞'}`);

  // Tous les prospects qui ont une sélection captée mais quote_items vide.
  // Note : quote_items est jsonb DEFAULT '[]', donc le critère vide est
  // "jsonb_array_length = 0" — pas IS NULL. La colonne est NOT NULL.
  let query = supabase
    .from('prospects')
    .select(
      `id, pack_code, selected_addon_ids, events_interest, quote_items,
       company:companies(category)`,
    )
    .or('pack_code.neq.A_DEFINIR,selected_addon_ids.neq.{}')
    .order('created_at', { ascending: true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Read prospects failed: ${error.message}`);
  }

  function pickFirst<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const candidates = (data ?? [])
    .map((r) => ({
      ...(r as ProspectCandidate),
      company: pickFirst(
        r.company as { category: string | null } | { category: string | null }[] | null,
      ),
    }))
    .filter((r) => {
      // Skip si quote_items déjà rempli
      const arr = Array.isArray(r.quote_items) ? (r.quote_items as unknown[]) : [];
      return arr.length === 0;
    });

  console.log(`[backfill] ${candidates.length} prospects éligibles`);

  let hydrated = 0;
  let skippedEmpty = 0;
  let errors = 0;

  for (const p of candidates) {
    try {
      const { quote_items, warnings } = await hydrateQuoteItemsFromSelection({
        pack_code: (p.pack_code as 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR' | null) ?? null,
        selected_addon_ids: p.selected_addon_ids ?? [],
        events_interest: p.events_interest ?? [],
        categorie: p.company?.category ?? null,
      });

      if (quote_items.length === 0) {
        console.log(
          `[backfill] prospect=${p.id} → 0 items, ${warnings.length} warnings ${
            warnings.length > 0 ? `(${warnings.join(' | ')})` : ''
          }`,
        );
        skippedEmpty++;
        continue;
      }

      if (dryRun) {
        console.log(
          `[backfill] DRY prospect=${p.id} → ${quote_items.length} items (${warnings.length} warnings)`,
        );
      } else {
        const { error: updErr } = await supabase
          .from('prospects')
          .update({ quote_items: quote_items as never })
          .eq('id', p.id);
        if (updErr) {
          console.error(`[backfill] UPDATE failed prospect=${p.id} msg=${updErr.message}`);
          errors++;
          continue;
        }
        console.log(
          `[backfill] ✓ prospect=${p.id} → ${quote_items.length} items hydratés${
            warnings.length > 0 ? ` (${warnings.length} warnings)` : ''
          }`,
        );
      }
      hydrated++;
    } catch (err) {
      console.error(
        `[backfill] hydrate-failed prospect=${p.id} msg=${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  console.log(
    `[backfill] done — hydrated=${hydrated} skipped=${skippedEmpty} errors=${errors}${dryRun ? ' (DRY RUN, no DB writes)' : ''}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
