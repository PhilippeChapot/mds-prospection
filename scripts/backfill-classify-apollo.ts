/**
 * P5.x.ApolloEnrichFixes — backfill : reclassifie les sociétés INCONNU (ou sans
 * pôle) qui disposent de données Apollo (apollo_raw_data) via Claude Haiku.
 *
 * Lancement manuel après deploy :
 *   pnpm tsx scripts/backfill-classify-apollo.ts          (dry-run)
 *   pnpm tsx scripts/backfill-classify-apollo.ts --apply  (écrit en base)
 *
 * Rate-limit doux (~5 req/s). Best-effort par société.
 */

import { createClient } from '@supabase/supabase-js';
import { classifyCompanyToPole, resolvePoleCode } from '../src/lib/admin/companies/classify-pole';

const APPLY = process.argv.includes('--apply');
const SLEEP_MS = 220; // ~4.5 req/s

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.');
  process.exit(1);
}
const db = createClient(url, key);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Sociétés sans pôle classé (pole_id null OU pôle INCONNU) ayant des data Apollo.
  const { data: inconnu } = await db.from('poles').select('id').eq('code', 'INCONNU').maybeSingle();
  const inconnuId = inconnu?.id ?? null;

  const { data: rows, error } = await db
    .from('companies')
    .select('id, name, industry, keywords, description, primary_domain, pole_id, apollo_raw_data')
    .not('apollo_raw_data', 'is', null);
  if (error) {
    console.error('SELECT failed:', error.message);
    process.exit(1);
  }

  const candidates = (rows ?? []).filter(
    (r) => r.pole_id === null || (inconnuId && r.pole_id === inconnuId),
  );
  console.log(
    `${candidates.length} sociétés à reclassifier (apollo_raw_data présent, pôle INCONNU/null).${APPLY ? '' : ' [DRY-RUN]'}`,
  );

  const { data: poles } = await db.from('poles').select('id, code');
  const poleIdByCode = new Map((poles ?? []).map((p) => [p.code as string, p.id as string]));

  let updated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const result = await classifyCompanyToPole({
      name: c.name as string,
      industry: c.industry as string | null,
      keywords: c.keywords as string[] | null,
      description: c.description as string | null,
      domain: c.primary_domain as string | null,
    });
    await sleep(SLEEP_MS);
    if (!result) {
      skipped += 1;
      continue;
    }
    const code = resolvePoleCode(result);
    const poleId = poleIdByCode.get(code) ?? null;
    console.log(
      `  ${c.name} → ${code} (${Math.round(result.confidence * 100)}%) : ${result.reasoning}`,
    );
    if (!APPLY || !poleId) {
      skipped += 1;
      continue;
    }
    const { error: updErr } = await db
      .from('companies')
      .update({
        pole_id: poleId,
        pole_classified_by: 'ai',
        pole_classified_at: new Date().toISOString(),
        pole_confidence: result.confidence,
        pole_reasoning: result.reasoning,
      } as never)
      .eq('id', c.id as string);
    if (updErr) {
      console.error(`  ⚠️ update failed ${c.id}: ${updErr.message}`);
      skipped += 1;
    } else {
      updated += 1;
    }
  }

  console.log(`Terminé. updated=${updated} skipped=${skipped}${APPLY ? '' : ' [DRY-RUN]'}`);
}

void main();
