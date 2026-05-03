/**
 * Data loader pour le wizard etape 2.
 *
 * Charge en parallele :
 *   - pricing_tiers de la saison active (filtres par derived_category)
 *   - addon_options de la saison active (filtres par scope = salons selectionnes)
 *   - booth_inventory disponibles (status='available') de la saison active
 *   - app_settings.canva_md26_plan_url (URL embed Canva)
 *
 * Retourne `null` si pas de saison active configuree.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { CANVA_PLAN_SETTINGS_KEY } from '@/lib/canva/resolve-shortlink';

export interface PricingTier {
  id: string;
  packCode: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';
  category: 'prs_exhibitor' | 'standard';
  priceEurHt: number;
  /**
   * Supplement HT pour ajouter MDS Marseille au pack PRS.
   * null = Marseille non disponible pour ce (pack, category).
   */
  marseilleSupplementEurHt: number | null;
  descriptionShortFr: string | null;
  descriptionShortEn: string | null;
  descriptionFullFr: string | null;
  descriptionFullEn: string | null;
}

export interface AddonOption {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  category: string;
  scope: 'prs_only' | 'mds_only' | 'both';
  priceEurHt: number;
  unit: 'unit' | 'per_brand' | 'per_1000';
  displayOrder: number;
}

export interface BoothOption {
  id: string;
  code: string;
  label: string | null;
  event: 'paris' | 'marseille' | 'bruxelles';
  room: string | null;
  surfaceM2: number | null;
  packCode: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR' | null;
  poleId: string | null;
  poleCode: string | null;
}

export interface Step2Data {
  seasonId: string;
  seasonCode: string;
  pricingTiers: PricingTier[];
  addons: AddonOption[];
  booths: BoothOption[];
  canvaPlanUrl: string | null;
}

export async function loadStep2Data(): Promise<Step2Data | null> {
  const supabase = getSupabaseServiceClient();

  // 1. Saison active
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('id, code')
    .eq('is_active', true)
    .maybeSingle();

  if (seasonErr || !season) {
    console.error('[step2-data] no active season', seasonErr);
    return null;
  }

  // 2. Fetch en parallele
  const [tiersRes, addonsRes, boothsRes, canvaRes] = await Promise.all([
    supabase
      .from('pricing_tiers')
      .select(
        'id, pack_code, category, price_eur_ht, marseille_supplement_eur_ht, description_short_fr, description_short_en, description_full_fr, description_full_en',
      )
      .eq('season_id', season.id)
      .eq('is_active', true)
      .order('price_eur_ht', { ascending: true }),
    supabase
      .from('addon_options')
      .select(
        'id, code, name_fr, name_en, description_fr, description_en, category, scope, price_eur_ht, unit, display_order',
      )
      .eq('season_id', season.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('booth_inventory')
      .select('id, code, label, event, room, surface_m2, pack_code, pole_id, poles(code)')
      .eq('season_id', season.id)
      .eq('status', 'available')
      .order('event', { ascending: true })
      .order('code', { ascending: true }),
    supabase.from('app_settings').select('value').eq('key', CANVA_PLAN_SETTINGS_KEY).maybeSingle(),
  ]);

  const pricingTiers: PricingTier[] = (tiersRes.data ?? []).map((t) => ({
    id: t.id,
    packCode: t.pack_code,
    category: t.category as 'prs_exhibitor' | 'standard',
    priceEurHt: Number(t.price_eur_ht),
    marseilleSupplementEurHt:
      t.marseille_supplement_eur_ht != null ? Number(t.marseille_supplement_eur_ht) : null,
    descriptionShortFr: t.description_short_fr,
    descriptionShortEn: t.description_short_en,
    descriptionFullFr: t.description_full_fr,
    descriptionFullEn: t.description_full_en,
  }));

  const addons: AddonOption[] = (addonsRes.data ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    nameFr: a.name_fr,
    nameEn: a.name_en,
    descriptionFr: a.description_fr,
    descriptionEn: a.description_en,
    category: a.category,
    scope: a.scope,
    priceEurHt: Number(a.price_eur_ht),
    unit: a.unit,
    displayOrder: a.display_order,
  }));

  const booths: BoothOption[] = (boothsRes.data ?? []).map((b) => {
    const poleObj = b.poles as { code: string } | null;
    return {
      id: b.id,
      code: b.code,
      label: b.label,
      event: b.event,
      room: b.room,
      surfaceM2: b.surface_m2 != null ? Number(b.surface_m2) : null,
      packCode: b.pack_code,
      poleId: b.pole_id,
      poleCode: poleObj?.code ?? null,
    };
  });

  // canva : value est jsonb (string JSON)
  const canvaValue = canvaRes.data?.value;
  const canvaPlanUrl = typeof canvaValue === 'string' && canvaValue.length > 0 ? canvaValue : null;

  return {
    seasonId: season.id,
    seasonCode: season.code,
    pricingTiers,
    addons,
    booths,
    canvaPlanUrl,
  };
}
