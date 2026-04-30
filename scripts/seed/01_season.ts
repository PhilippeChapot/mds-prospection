import { admin, SEASON_CODE } from './_client';

/**
 * Seed the initial season MDS_2026 (is_active = true).
 * Idempotent : on conflict (code) do update.
 */
async function main() {
  console.log(`→ Seeding season ${SEASON_CODE}…`);

  const { data: existing } = await admin
    .from('seasons')
    .select('id, code')
    .eq('code', SEASON_CODE)
    .maybeSingle();

  if (existing) {
    console.log(`  ✓ Season ${SEASON_CODE} already exists (id=${existing.id}) — skipping insert.`);
    return;
  }

  const { data, error } = await admin
    .from('seasons')
    .insert({
      code: SEASON_CODE,
      name_fr: 'MediaDays Solutions 2026',
      name_en: 'MediaDays Solutions 2026',
      start_date: '2026-11-26',
      end_date: '2026-12-15',
      is_active: true,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  console.log(`  ✓ Season ${SEASON_CODE} created (id=${data.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
