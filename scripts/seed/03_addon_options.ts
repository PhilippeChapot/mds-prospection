import { admin, getActiveSeasonId } from './_client';

/**
 * Seed addon_options pour MDS_2026 — 18 options (SPEC §3.5).
 * Source : DDP MDS + DDP PRS (avril 2026).
 */
type Addon = {
  code: string;
  name_fr: string;
  name_en: string;
  category:
    | 'logistique'
    | 'audiovisuel'
    | 'connectivite'
    | 'espaces'
    | 'visibilite'
    | 'communication'
    | 'goodies';
  scope: 'prs_only' | 'mds_only' | 'both';
  price_eur_ht: number;
  unit: 'unit' | 'per_brand' | 'per_1000';
  display_order: number;
};

const ADDONS: Addon[] = [
  // Logistique stand
  {
    code: 'electrical_6kw',
    name_fr: 'Branchement électrique +6 kW intermittent',
    name_en: 'Additional electrical hookup +6 kW intermittent',
    category: 'logistique',
    scope: 'both',
    price_eur_ht: 900,
    unit: 'unit',
    display_order: 10,
  },
  {
    code: 'co_exhibitor_brand',
    name_fr: 'Accueil marque co-exposante',
    name_en: 'Co-exhibitor brand hosting',
    category: 'logistique',
    scope: 'both',
    price_eur_ht: 600,
    unit: 'per_brand',
    display_order: 20,
  },
  // Audiovisuel
  {
    code: 'screen_43',
    name_fr: 'Écran sur pied 43" — 1 jour',
    name_en: 'Floor-standing 43" screen — 1 day',
    category: 'audiovisuel',
    scope: 'both',
    price_eur_ht: 500,
    unit: 'unit',
    display_order: 30,
  },
  {
    code: 'screen_55',
    name_fr: 'Écran sur pied 55" — 1 jour',
    name_en: 'Floor-standing 55" screen — 1 day',
    category: 'audiovisuel',
    scope: 'both',
    price_eur_ht: 600,
    unit: 'unit',
    display_order: 40,
  },
  // Connectivité
  {
    code: 'wifi_expert',
    name_fr: 'WiFi Expert (1 accès, 8 Mbps, 5 GHz)',
    name_en: 'WiFi Expert (1 access, 8 Mbps, 5 GHz)',
    category: 'connectivite',
    scope: 'both',
    price_eur_ht: 200,
    unit: 'unit',
    display_order: 50,
  },
  {
    code: 'wired_2mbps',
    name_fr: 'Accès internet filaire 2 Mbps',
    name_en: 'Wired internet access 2 Mbps',
    category: 'connectivite',
    scope: 'both',
    price_eur_ht: 600,
    unit: 'unit',
    display_order: 60,
  },
  {
    code: 'wired_6mbps',
    name_fr: 'Accès internet filaire 6 Mbps',
    name_en: 'Wired internet access 6 Mbps',
    category: 'connectivite',
    scope: 'both',
    price_eur_ht: 900,
    unit: 'unit',
    display_order: 70,
  },
  {
    code: 'wifi_sponsor',
    name_fr: 'Sponsor WiFi (visibilité globale)',
    name_en: 'WiFi Sponsor (global visibility)',
    category: 'connectivite',
    scope: 'both',
    price_eur_ht: 5000,
    unit: 'unit',
    display_order: 80,
  },
  // Espaces & événements
  {
    code: 'private_room_1h',
    name_fr: 'Salle privatisable 1h (exclusif)',
    name_en: 'Private room rental 1h (exclusive)',
    category: 'espaces',
    scope: 'both',
    price_eur_ht: 2000,
    unit: 'unit',
    display_order: 90,
  },
  {
    code: 'kakemono_pack',
    name_fr: '4 kakémonos + nom sur plan + annonces',
    name_en: '4 banners + name on map + announcements',
    category: 'espaces',
    scope: 'both',
    price_eur_ht: 2500,
    unit: 'unit',
    display_order: 100,
  },
  // Visibilité partenaire
  {
    code: 'logo_gold',
    name_fr: 'Logo partenaire Gold',
    name_en: 'Gold partner logo',
    category: 'visibilite',
    scope: 'both',
    price_eur_ht: 3000,
    unit: 'unit',
    display_order: 110,
  },
  {
    code: 'logo_silver',
    name_fr: 'Logo partenaire Silver',
    name_en: 'Silver partner logo',
    category: 'visibilite',
    scope: 'both',
    price_eur_ht: 1700,
    unit: 'unit',
    display_order: 120,
  },
  {
    code: 'vip_supplier',
    name_fr: 'Participant VIP fournisseur',
    name_en: 'Supplier VIP participant',
    category: 'visibilite',
    scope: 'both',
    price_eur_ht: 500,
    unit: 'unit',
    display_order: 130,
  },
  // Communication
  {
    code: 'email_blast_connectonair',
    name_fr: 'Emailing dédié (base ConnectOnAir 20 000 contacts)',
    name_en: 'Dedicated emailing (ConnectOnAir 20,000 contacts)',
    category: 'communication',
    scope: 'both',
    price_eur_ht: 500,
    unit: 'unit',
    display_order: 140,
  },
  {
    code: 'pubre_lalettre_pro',
    name_fr: 'Publirédactionnel LaLettre.pro + MAG Hebdo',
    name_en: 'Sponsored content LaLettre.pro + MAG Hebdo',
    category: 'communication',
    scope: 'prs_only',
    price_eur_ht: 400,
    unit: 'unit',
    display_order: 150,
  },
  // Goodies & impressions
  {
    code: 'lanyards_1000',
    name_fr: 'Tours de cou personnalisés (1 000 ex.)',
    name_en: 'Custom lanyards (1,000 units)',
    category: 'goodies',
    scope: 'both',
    price_eur_ht: 2000,
    unit: 'per_1000',
    display_order: 160,
  },
  {
    code: 'panel_1x2',
    name_fr: 'Panneau autoporté 1 m × 2 m',
    name_en: 'Free-standing panel 1m × 2m',
    category: 'goodies',
    scope: 'both',
    price_eur_ht: 500,
    unit: 'unit',
    display_order: 170,
  },
  {
    code: 'panel_2x2',
    name_fr: 'Panneau autoporté 2 m × 2 m',
    name_en: 'Free-standing panel 2m × 2m',
    category: 'goodies',
    scope: 'both',
    price_eur_ht: 1000,
    unit: 'unit',
    display_order: 180,
  },
];

async function main() {
  const seasonId = await getActiveSeasonId();
  console.log(`→ Seeding addon_options for season ${seasonId} (${ADDONS.length} options)…`);

  let created = 0;
  let updated = 0;

  for (const addon of ADDONS) {
    const { data: existing } = await admin
      .from('addon_options')
      .select('id')
      .eq('season_id', seasonId)
      .eq('code', addon.code)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('addon_options')
        .update({ ...addon, is_active: true })
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin
        .from('addon_options')
        .insert({ season_id: seasonId, ...addon, is_active: true });
      if (error) throw error;
      created += 1;
    }
  }

  console.log(
    `  ✓ addon_options : created=${created}, updated=${updated} (total=${ADDONS.length})`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
