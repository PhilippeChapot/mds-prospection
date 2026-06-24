/**
 * P5.x.InferMissingCountry — infère le pays ISO 2 des sociétés `country IS NULL`
 * (suite au backfill SQL strict de la migration 0110) via Claude Haiku 4.5.
 *
 * Lancement (Phil) :
 *   set -a && source .env.local && set +a && pnpm tsx scripts/infer-missing-country.ts          # DRY-RUN
 *   set -a && source .env.local && set +a && pnpm tsx scripts/infer-missing-country.ts --apply  # écrit en base
 *
 * Rate-limit doux (~4.5 req/s). Best-effort par société. Audit log par update.
 */

import { createClient } from '@supabase/supabase-js';
import {
  inferCompanyCountry,
  shouldApplyInferredCountry,
} from '../src/lib/admin/companies/infer-country';

const APPLY = process.argv.includes('--apply');
const SLEEP_MS = 220; // ~4.5 req/s

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY manquant.');
  process.exit(1);
}
const db = createClient(url, key);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data: rows, error } = await db
    .from('companies')
    .select(
      'id, name, primary_domain, website, city, raw_address, industry, keywords, apollo_raw_data',
    )
    .is('country', null);
  if (error) {
    console.error('SELECT failed:', error.message);
    process.exit(1);
  }

  const companies = rows ?? [];
  console.log(
    `${companies.length} sociétés à inférer (country IS NULL).${APPLY ? '' : ' [DRY-RUN]'}`,
  );

  let processed = 0;
  let updated = 0;
  let skippedLowConf = 0;
  let failed = 0;

  for (const c of companies) {
    processed += 1;
    const apollo = (c.apollo_raw_data ?? null) as Record<string, unknown> | null;
    const description =
      apollo && typeof apollo.short_description === 'string' ? apollo.short_description : null;

    const result = await inferCompanyCountry({
      name: c.name as string,
      primaryDomain: c.primary_domain as string | null,
      website: c.website as string | null,
      city: c.city as string | null,
      rawAddress: c.raw_address as string | null,
      industry: c.industry as string | null,
      keywords: c.keywords as string[] | null,
      description,
    });
    await sleep(SLEEP_MS);

    if (!result) {
      failed += 1;
      console.log(`  [${processed}] ${c.name} → ⚠️ échec inférence`);
      continue;
    }
    console.log(
      `  [${processed}] ${c.name} → ${result.iso2} (${Math.round(result.confidence * 100)}%) : ${result.reasoning}`,
    );
    if (!shouldApplyInferredCountry(result)) {
      skippedLowConf += 1;
      continue;
    }
    if (!APPLY) {
      updated += 1; // compté comme "aurait été mis à jour" en dry-run
      continue;
    }

    const { error: updErr } = await db
      .from('companies')
      .update({ country: result.iso2 })
      .eq('id', c.id as string);
    if (updErr) {
      failed += 1;
      console.error(`  ⚠️ update failed ${c.id}: ${updErr.message}`);
      continue;
    }
    await db.from('audit_log').insert({
      user_id: null,
      action: 'sync_manual', // pas d'enum dédiée → sync_manual
      entity_type: 'companies',
      entity_id: c.id as string,
      before: { country: null },
      after: {
        kind: 'country_inferred_ai',
        country: result.iso2,
        confidence: result.confidence,
        reasoning: result.reasoning,
      },
    });
    updated += 1;
  }

  console.log(
    `Terminé. processed=${processed} updated=${updated} skipped_low_conf=${skippedLowConf} failed=${failed}${APPLY ? '' : ' [DRY-RUN]'}`,
  );
}

void main();
