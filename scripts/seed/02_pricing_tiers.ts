import { admin, getActiveSeasonId } from './_client';

/**
 * Seed pricing_tiers for MDS_2026 — 6 lignes (3 packs × 2 categories).
 * Source : SPEC §3.4 (DDP officielles).
 */
type Tier = {
  pack_code: 'ACCESS' | 'CLASSIC' | 'PREMIUM';
  category: 'prs_exhibitor' | 'standard';
  price_eur_ht: number;
  description_short_fr: string;
  description_short_en: string;
  description_full_fr: string;
  description_full_en: string;
};

const TIERS: Tier[] = [
  // ----- ACCESS -----
  {
    pack_code: 'ACCESS',
    category: 'standard',
    price_eur_ht: 12500,
    description_short_fr: 'Stand de base, espace privatif',
    description_short_en: 'Basic booth, private space',
    description_full_fr:
      'Pack ACCESS MDS — stand 6 m² + espace privatif, accès tous les événements de la saison.',
    description_full_en:
      'ACCESS MDS pack — 6 sqm booth + private space, full event access for the season.',
  },
  {
    pack_code: 'ACCESS',
    category: 'prs_exhibitor',
    price_eur_ht: 1980,
    description_short_fr: 'Tarif préférentiel exposants Paris Radio Show',
    description_short_en: 'Preferential rate for Paris Radio Show exhibitors',
    description_full_fr:
      "Pack ACCESS PRS — tarif préférentiel jusqu'à -84% pour les exposants Paris Radio Show 2026.",
    description_full_en:
      'ACCESS PRS pack — preferential rate (up to -84%) for Paris Radio Show 2026 exhibitors.',
  },
  // ----- CLASSIC -----
  {
    pack_code: 'CLASSIC',
    category: 'standard',
    price_eur_ht: 14800,
    description_short_fr: 'Stand + 5 places déjeuner Paris',
    description_short_en: 'Booth + 5 lunch tickets Paris',
    description_full_fr:
      'Pack CLASSIC MDS — stand 6 m² + 5 places déjeuner Paris (ou 2 places PRS).',
    description_full_en:
      'CLASSIC MDS pack — 6 sqm booth + 5 lunch tickets Paris (or 2 PRS tickets).',
  },
  {
    pack_code: 'CLASSIC',
    category: 'prs_exhibitor',
    price_eur_ht: 2475,
    description_short_fr: 'Stand + déjeuner PRS — tarif exposant',
    description_short_en: 'Booth + PRS lunch — exhibitor rate',
    description_full_fr:
      'Pack CLASSIC PRS — stand + 2 places déjeuner Paris Radio Show (tarif exposant).',
    description_full_en:
      'CLASSIC PRS pack — booth + 2 Paris Radio Show lunch tickets (exhibitor rate).',
  },
  // ----- PREMIUM -----
  {
    pack_code: 'PREMIUM',
    category: 'standard',
    price_eur_ht: 20500,
    description_short_fr: 'Stand + temps de parole + workshop',
    description_short_en: 'Booth + speaking slot + workshop',
    description_full_fr:
      'Pack PREMIUM MDS — stand + temps de parole + workshop / masterclass + visibilité maximale.',
    description_full_en:
      'PREMIUM MDS pack — booth + speaking slot + workshop / masterclass + max visibility.',
  },
  {
    pack_code: 'PREMIUM',
    category: 'prs_exhibitor',
    price_eur_ht: 8700,
    description_short_fr: 'Pack premium PRS avec workshop',
    description_short_en: 'PRS premium pack with workshop',
    description_full_fr:
      'Pack PREMIUM PRS — stand + temps de parole + workshop dédié Paris Radio Show.',
    description_full_en:
      'PREMIUM PRS pack — booth + speaking slot + Paris Radio Show dedicated workshop.',
  },
];

async function main() {
  const seasonId = await getActiveSeasonId();
  console.log(`→ Seeding pricing_tiers for season ${seasonId}…`);

  let created = 0;
  let updated = 0;

  for (const tier of TIERS) {
    const { data: existing } = await admin
      .from('pricing_tiers')
      .select('id')
      .eq('season_id', seasonId)
      .eq('pack_code', tier.pack_code)
      .eq('category', tier.category)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('pricing_tiers')
        .update({ ...tier, is_active: true })
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin
        .from('pricing_tiers')
        .insert({ season_id: seasonId, ...tier, is_active: true });
      if (error) throw error;
      created += 1;
    }
  }

  console.log(`  ✓ pricing_tiers : created=${created}, updated=${updated} (total=${TIERS.length})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
