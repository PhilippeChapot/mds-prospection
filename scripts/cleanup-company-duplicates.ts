/**
 * P5.x.MatchingFix — script de dedup des companies en base.
 *
 * Algo :
 *   1. Trouve les clusters par UPPER(strip-accents(name)) HAVING count > 1.
 *   2. Designe le "keeper" : row avec le plus de champs critiques remplis
 *      (website, address, city, postal_code, phone, linkedin_url,
 *      sellsy_id, primary_domain, description).
 *   3. Merge les external_event_tags (union par eventKey).
 *   4. Reassign FK enfants vers le keeper : contacts, prospects,
 *      public_signup_attempts (matched_company_id), lifecycle_send_queue,
 *      lifecycle_recipients, internal_conversations (via metadata).
 *   5. Delete les rows non-keeper.
 *   6. Audit log par cluster.
 *
 * Usage :
 *   pnpm tsx scripts/cleanup-company-duplicates.ts --dry-run   (rapport)
 *   pnpm tsx scripts/cleanup-company-duplicates.ts             (execution reelle)
 *
 * Sauvegarde : avant l execution reelle, faire un Supabase backup snapshot.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  scoreCompletenessForCleanup,
  mergeEventTagsForCleanup,
  pickBestCountryForCleanup,
  normalizeNameForCluster,
} from '../src/lib/external-events/cleanup-helpers';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
loadEnv({ path: path.join(projectRoot, '.env.local'), override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

const DRY_RUN = process.argv.includes('--dry-run');

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CompanyRow {
  id: string;
  name: string;
  name_normalized: string | null;
  country: string | null;
  website: string | null;
  primary_domain: string | null;
  raw_address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  linkedin_url: string | null;
  sellsy_id: string | null;
  description: string | null;
  external_event_tags: Record<string, number[]> | null;
  was_prs_2026_exhibitor: boolean;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY-RUN — aucune modif DB' : '⚠️  LIVE-RUN — modifs DB irreversibles');

  // 1. Fetch all companies (1 round)
  const { data: all } = await sb
    .from('companies')
    .select(
      'id, name, name_normalized, country, website, primary_domain, raw_address, city, postal_code, phone, linkedin_url, sellsy_id, description, external_event_tags, was_prs_2026_exhibitor',
    );
  if (!all) {
    console.error('No data');
    return;
  }
  const rows = all as CompanyRow[];
  console.log(`Total companies: ${rows.length}`);

  // 2. Cluster par UPPER(unaccent(name))
  const clusters = new Map<string, CompanyRow[]>();
  for (const r of rows) {
    const k = normalizeNameForCluster(r.name);
    if (!k) continue;
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k)!.push(r);
  }
  const dupClusters = [...clusters.entries()].filter(([, v]) => v.length > 1);
  console.log(`Duplicate clusters: ${dupClusters.length}`);
  if (dupClusters.length === 0) {
    console.log('Nothing to merge ✓');
    return;
  }

  let mergedRows = 0;
  for (const [key, candidates] of dupClusters) {
    // Score completeness pour chaque candidat.
    const scored = candidates.map((c) => ({ ...c, score: scoreCompletenessForCleanup(c) }));
    scored.sort((a, b) => b.score - a.score);
    const keeper = scored[0];
    const losers = scored.slice(1);

    console.log(`\nCluster "${key}" (${candidates.length} rows):`);
    console.log(
      `  KEEP   ${keeper.id.slice(0, 8)} name="${keeper.name}" score=${keeper.score} country=${keeper.country}`,
    );
    for (const l of losers) {
      console.log(
        `  MERGE  ${l.id.slice(0, 8)} name="${l.name}" score=${l.score} country=${l.country}`,
      );
    }

    if (DRY_RUN) {
      mergedRows += losers.length;
      continue;
    }

    // 3. Merge tags + pick best country.
    const mergedTags = mergeEventTagsForCleanup(
      keeper.external_event_tags,
      losers.map((l) => l.external_event_tags),
    );
    const bestCountry = pickBestCountryForCleanup([keeper, ...losers]);
    const mergedPrs = keeper.was_prs_2026_exhibitor || losers.some((l) => l.was_prs_2026_exhibitor);

    // Update keeper.
    const { error: upKeeperErr } = await sb
      .from('companies')
      .update({
        external_event_tags: mergedTags,
        country: bestCountry,
        was_prs_2026_exhibitor: mergedPrs,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', keeper.id);
    if (upKeeperErr) {
      console.error(`  ✗ Update keeper failed: ${upKeeperErr.message}`);
      continue;
    }

    const loserIds = losers.map((l) => l.id);

    // 4. Reassign FKs.
    await sb
      .from('contacts')
      .update({ company_id: keeper.id } as never)
      .in('company_id', loserIds);
    await sb
      .from('prospects')
      .update({ company_id: keeper.id } as never)
      .in('company_id', loserIds);
    await sb
      .from('public_signup_attempts')
      .update({ matched_company_id: keeper.id } as never)
      .in('matched_company_id', loserIds);

    // affiliate_claims (P7.x)
    await sb
      .from('affiliate_claims')
      .update({ company_id: keeper.id } as never)
      .in('company_id', loserIds);

    // 5. Delete losers.
    const { error: delErr } = await sb.from('companies').delete().in('id', loserIds);
    if (delErr) {
      console.error(`  ✗ Delete losers failed: ${delErr.message}`);
      continue;
    }

    // 6. Audit log (best-effort).
    await sb.from('audit_log').insert({
      user_id: null,
      entity_type: 'companies',
      entity_id: keeper.id,
      action: 'update',
      after: {
        kind: 'company_duplicates_merged',
        cluster_key: key,
        keeper_id: keeper.id,
        keeper_name: keeper.name,
        loser_ids: loserIds,
        loser_names: losers.map((l) => l.name),
        merged_event_tags: mergedTags,
        final_country: bestCountry,
      } as never,
    });

    mergedRows += losers.length;
  }

  console.log(`\n✓ Done. Merged ${mergedRows} duplicate rows into ${dupClusters.length} keepers.`);
  if (DRY_RUN) {
    console.log('🔍 Was DRY-RUN — no DB changes applied.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
