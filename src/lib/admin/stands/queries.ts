/**
 * P6.x.2a — queries lecture stands.
 *
 * Pure read-side : utilise le service-role client. Les writes sont dans
 * `actions.ts` (avec requireAdminProfile).
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type Salle = 'delorme' | 'gabriel' | 'le_notre' | 'foyer' | 'mezzanine' | 'soufflot';
export type StandStatus = 'libre' | 'reserve' | 'paye' | 'bloque';
export type PoleCode =
  | 'REGIES_RETAIL_MEDIA'
  | 'AUDIO_RADIO'
  | 'DIFFUSION_INFRA'
  | 'VIDEO_CTV'
  | 'OUTDOOR_DOOH'
  | 'DATA_ADTECH';

export interface StandRow {
  id: string;
  number: string;
  salle: Salle;
  taille_m2: number;
  pole_recommended: PoleCode | null;
  status: StandStatus;
  prospect_id: string | null;
  notes: string | null;
  /** P6.x.3 — coordonnees overlay plan Canva (en % 0-100, peuvent etre null). */
  position_x: number | null;
  position_y: number | null;
  position_w: number | null;
  position_h: number | null;
  created_at: string;
  updated_at: string;
}

export interface StandWithProspect extends StandRow {
  prospect: {
    id: string;
    status: string;
    company_name: string | null;
    /** P6.x.3 — RGPD voisins : si false, nom non affiche cote partenaire. */
    company_public_visibility: boolean;
    contact_email: string | null;
  } | null;
}

export interface ListStandsFilters {
  salle?: Salle;
  status?: StandStatus;
  pole?: PoleCode;
  /** Si fourni : retourne les stands libres + celui éventuellement déjà assigné
   *  à ce prospect (utile pour le picker "changer de stand"). */
  available_for?: string;
  taille_m2?: number;
}

export async function listStands(filters: ListStandsFilters = {}): Promise<StandWithProspect[]> {
  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from('stands')
    .select(
      `id, number, salle, taille_m2, pole_recommended, status, prospect_id, notes,
       position_x, position_y, position_w, position_h,
       created_at, updated_at,
       prospect:prospects(id, status,
         company:companies(name, public_visibility),
         contact:contacts(email))`,
    )
    .order('salle', { ascending: true })
    .order('number', { ascending: true });

  if (filters.salle) query = query.eq('salle', filters.salle);
  if (filters.pole) query = query.eq('pole_recommended', filters.pole);
  if (typeof filters.taille_m2 === 'number') query = query.eq('taille_m2', filters.taille_m2);

  if (filters.available_for) {
    // Stands libres OU celui déjà assigné à ce prospect (pour le picker)
    query = query.or(`status.eq.libre,prospect_id.eq.${filters.available_for}`);
  } else if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[stands/queries] listStands failed: %s', error.message);
    return [];
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  return (data ?? []).map((r) => {
    const p = pickOne(
      r.prospect as {
        id: string;
        status: string;
        company:
          | { name: string | null; public_visibility: boolean | null }
          | { name: string | null; public_visibility: boolean | null }[]
          | null;
        contact: { email: string } | { email: string }[] | null;
      } | null,
    );
    const company = p ? pickOne(p.company) : null;
    return {
      id: r.id,
      number: r.number,
      salle: r.salle as Salle,
      taille_m2: Number(r.taille_m2),
      pole_recommended: r.pole_recommended as PoleCode | null,
      status: r.status as StandStatus,
      prospect_id: r.prospect_id,
      notes: r.notes,
      position_x: r.position_x === null ? null : Number(r.position_x),
      position_y: r.position_y === null ? null : Number(r.position_y),
      position_w: r.position_w === null ? null : Number(r.position_w),
      position_h: r.position_h === null ? null : Number(r.position_h),
      created_at: r.created_at,
      updated_at: r.updated_at,
      prospect: p
        ? {
            id: p.id,
            status: p.status,
            company_name: company?.name ?? null,
            // Default TRUE pour les lignes anciennes ou les anciennes inserts.
            company_public_visibility: company?.public_visibility ?? true,
            contact_email: pickOne(p.contact)?.email ?? null,
          }
        : null,
    };
  });
}

export interface StandKpis {
  total: number;
  libre: number;
  reserve: number;
  paye: number;
  bloque: number;
}

export async function getStandKpis(salle?: Salle): Promise<StandKpis> {
  const supabase = getSupabaseServiceClient();
  let query = supabase.from('stands').select('status', { count: 'exact', head: false });
  if (salle) query = query.eq('salle', salle);
  const { data, error } = await query;
  if (error || !data) {
    console.warn('[stands/queries] getStandKpis failed: %s', error?.message ?? 'unknown');
    return { total: 0, libre: 0, reserve: 0, paye: 0, bloque: 0 };
  }
  const counts: StandKpis = { total: data.length, libre: 0, reserve: 0, paye: 0, bloque: 0 };
  for (const r of data) {
    if (r.status in counts) {
      counts[r.status as keyof StandKpis]++;
    }
  }
  return counts;
}

/**
 * P6.x.2a — mappe le statut prospect au statut stand correspondant.
 * Doctrine :
 *   - lead / contact / devis_envoye → 'reserve' (stand bloqué pour ce prospect)
 *   - acompte_paye / paye_integral / signe → 'paye' (engagement financier acté)
 *   - perdu → on retire l'assignation (caller responsibility)
 */
export function standStatusForProspectStatus(
  prospectStatus: string,
): 'reserve' | 'paye' | 'release' {
  switch (prospectStatus) {
    case 'acompte_paye':
    case 'paye_integral':
    case 'signe':
      return 'paye';
    case 'perdu':
      return 'release';
    default:
      return 'reserve';
  }
}

/** Lookup prospects en pipeline mais sans stand assigné — sidebar /admin/emplacements. */
export interface ProspectWithoutStand {
  id: string;
  status: string;
  company_name: string;
  contact_email: string | null;
  pack_code: string | null;
  estimated_amount: number | null;
  is_test: boolean;
}

export async function listProspectsWithoutStand(): Promise<ProspectWithoutStand[]> {
  const supabase = getSupabaseServiceClient();
  // Tous les prospects en pipeline (sauf perdu/lead trop fragiles), is_test=false.
  // On exclut ceux qui ont déjà un stand via une sous-requête anti-join.
  const { data: assigned } = await supabase
    .from('stands')
    .select('prospect_id')
    .not('prospect_id', 'is', null);
  const assignedSet = new Set((assigned ?? []).map((r) => r.prospect_id));

  const { data, error } = await supabase
    .from('prospects')
    .select(
      `id, status, pack_code, estimated_amount, is_test,
       company:companies(name),
       contact:contacts(email)`,
    )
    .eq('is_test', false)
    .in('status', ['devis_envoye', 'acompte_paye', 'signe', 'paye_integral'])
    .order('status', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('[stands/queries] listProspectsWithoutStand failed: %s', error.message);
    return [];
  }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  const out: ProspectWithoutStand[] = [];
  for (const r of data ?? []) {
    if (assignedSet.has(r.id)) continue;
    const company = pickOne(r.company);
    const contact = pickOne(r.contact);
    out.push({
      id: r.id,
      status: r.status,
      company_name: company?.name ?? '(société inconnue)',
      contact_email: contact?.email ?? null,
      pack_code: r.pack_code,
      estimated_amount: r.estimated_amount ? Number(r.estimated_amount) : null,
      is_test: r.is_test,
    });
  }
  return out;
}
