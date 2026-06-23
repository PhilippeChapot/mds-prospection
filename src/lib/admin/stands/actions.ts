'use server';

/**
 * P6.x.2a — server actions stands (catalogue + assignation).
 *
 * P6.x.MultiBooths — un prospect peut désormais détenir N stands (espace
 * premium étendu). L'assignation est donc *additive* : assigner un stand
 * ne libère plus l'éventuel stand déjà détenu par le prospect.
 *
 * Workflow assignation :
 *   1. assignStandToProspectAction(stand_id, prospect_id) :
 *      - Si stand pas libre (et pas déjà à ce prospect) → erreur
 *      - UPDATE stand : prospect_id + status calculé selon prospect.status
 *      - Recalcul prospects.booth_assignment = liste jointe des numéros de
 *        TOUS les stands du prospect (rétrocompat affichage P5.x.10).
 *   2. removeStandFromProspectAction(stand_id) : reset prospect_id +
 *      status='libre', puis recalcul booth_assignment depuis les stands restants.
 *   3. setProspectBoothsAction (batch) : voir multi-booth-actions.ts.
 *
 * Le prix ne dépend PAS du nombre de stands (cf. migration 0046 :
 * "pack du prospect = source du prix"). estimated_amount reste piloté par le
 * QuoteBuilder — l'allocation physique est découplée du montant (décision Phil
 * P6.x.MultiBooths : "Decouple").
 *
 * Sync statut prospect → stand : appelé par updateProspectStatusAction
 * (côté prospect actions.ts) via syncStandStatusFromProspect.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { standStatusForProspectStatus } from './queries';
import { recomputeBoothAssignment } from './booth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const LOG_PREFIX = '[admin/stands]';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const SALLE_VALUES = ['delorme', 'gabriel', 'le_notre', 'foyer', 'mezzanine', 'soufflot'] as const;
const STATUS_VALUES = ['libre', 'reserve', 'reserve_signe', 'paye', 'bloque'] as const;
const POLE_VALUES = [
  'REGIES_RETAIL_MEDIA',
  'AUDIO_RADIO',
  'DIFFUSION_INFRA',
  'VIDEO_CTV',
  'OUTDOOR_DOOH',
  'DATA_ADTECH',
] as const;

const assignSchema = z.object({
  stand_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
});

export async function assignStandToProspectAction(
  input: z.infer<typeof assignSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  const { stand_id, prospect_id } = parsed.data;

  const supabase = getSupabaseServiceClient();

  // 1. Lookup stand cible
  const { data: stand, error: standErr } = await supabase
    .from('stands')
    .select('id, number, salle, status, prospect_id')
    .eq('id', stand_id)
    .maybeSingle();
  if (standErr || !stand) return { ok: false, error: 'Stand introuvable.' };
  if (stand.status === 'bloque') return { ok: false, error: 'Ce stand est bloqué (hors-vente).' };
  if (stand.status !== 'libre' && stand.prospect_id !== prospect_id) {
    return { ok: false, error: 'Ce stand est déjà assigné à un autre prospect.' };
  }

  // 2. Lookup prospect. P6.x.MultiBooths : assignation ADDITIVE — on ne
  // libère plus l'éventuel stand déjà détenu (un prospect peut avoir N stands).
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, status')
    .eq('id', prospect_id)
    .maybeSingle();
  if (pErr || !prospect) return { ok: false, error: 'Prospect introuvable.' };

  // 3. Statut stand selon statut prospect
  const computed = standStatusForProspectStatus(prospect.status);
  if (computed === 'release') {
    return {
      ok: false,
      error: "Impossible d'assigner un stand à un prospect 'perdu'. Réactivez-le d'abord.",
    };
  }
  const newStatus: 'reserve' | 'reserve_signe' | 'paye' = computed;

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('stands')
    .update({ prospect_id, status: newStatus, updated_at: now })
    .eq('id', stand_id);
  if (updErr) {
    console.error('%s assign-failed stand=%s msg=%s', LOG_PREFIX, stand_id, updErr.message);
    return { ok: false, error: updErr.message };
  }

  // 4. Recalcul prospects.booth_assignment (liste jointe de TOUS les stands).
  const boothAssignment = await recomputeBoothAssignment(supabase, prospect_id);
  await supabase
    .from('prospects')
    .update({
      booth_assignment: boothAssignment,
      booth_assigned_at: now,
      booth_assigned_by: profile.id,
      last_activity_at: now,
    })
    .eq('id', prospect_id);

  console.log(
    '%s assigned stand=%s number=%s prospect=%s status=%s booths=%s',
    LOG_PREFIX,
    stand_id,
    stand.number,
    prospect_id,
    newStatus,
    boothAssignment ?? '-',
  );

  // P14.4 : audit_log pour timeline drawer auto-entry "stand attribue".
  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'prospects',
    entity_id: prospect_id,
    action: 'update',
    after: {
      kind: 'stand_assigned',
      stand_id,
      stand_number: stand.number,
      stand_salle: stand.salle,
    },
  });

  revalidatePath(`/admin/prospects/${prospect_id}`);
  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id } };
}

const removeSchema = z.object({ stand_id: z.string().uuid() });

export async function removeStandFromProspectAction(
  input: z.infer<typeof removeSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    return { ok: false, error: 'Forbidden' };
  }
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = getSupabaseServiceClient();
  const { data: stand } = await supabase
    .from('stands')
    .select('id, prospect_id, number')
    .eq('id', parsed.data.stand_id)
    .maybeSingle();
  if (!stand) return { ok: false, error: 'Stand introuvable.' };

  const previousProspectId = stand.prospect_id;
  const now = new Date().toISOString();
  const { error: standErr } = await supabase
    .from('stands')
    .update({ prospect_id: null, status: 'libre', updated_at: now })
    .eq('id', parsed.data.stand_id);
  if (standErr) return { ok: false, error: standErr.message };

  if (previousProspectId) {
    // P6.x.MultiBooths : le prospect peut détenir d'autres stands → recalcul
    // de booth_assignment depuis les stands restants (null seulement si plus aucun).
    const boothAssignment = await recomputeBoothAssignment(supabase, previousProspectId);
    await supabase
      .from('prospects')
      .update(
        boothAssignment
          ? { booth_assignment: boothAssignment, last_activity_at: now }
          : {
              booth_assignment: null,
              booth_assigned_at: null,
              booth_assigned_by: null,
              last_activity_at: now,
            },
      )
      .eq('id', previousProspectId);
    revalidatePath(`/admin/prospects/${previousProspectId}`);
  }
  revalidatePath('/admin/emplacements');
  console.log(
    '%s removed stand=%s prev_prospect=%s',
    LOG_PREFIX,
    parsed.data.stand_id,
    previousProspectId ?? '-',
  );
  return { ok: true, data: { stand_id: parsed.data.stand_id } };
}

const updateSchema = z.object({
  stand_id: z.string().uuid(),
  number: z.string().trim().min(1).max(40).optional(),
  salle: z.enum(SALLE_VALUES).optional(),
  taille_m2: z.number().positive().max(999).optional(),
  pole_recommended: z.enum(POLE_VALUES).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

export async function updateStandAction(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Forbidden' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  const { stand_id, ...patch } = parsed.data;

  const supabase = getSupabaseServiceClient();

  // Garde-fous : passer un stand assigné en 'libre' force un retrait. Passer
  // en 'bloque' force aussi prospect_id=null (cf. contrainte DB chk_libre… +
  // doctrine "bloque = hors-vente").
  if (patch.status === 'libre' || patch.status === 'bloque') {
    const { data: stand } = await supabase
      .from('stands')
      .select('prospect_id')
      .eq('id', stand_id)
      .maybeSingle();
    if (stand?.prospect_id && patch.status === 'libre') {
      // On libère via removeStand pour propre sync prospect
      const r = await removeStandFromProspectAction({ stand_id });
      if (!r.ok) return r;
    } else if (stand?.prospect_id && patch.status === 'bloque') {
      await supabase
        .from('stands')
        .update({ prospect_id: null, updated_at: new Date().toISOString() })
        .eq('id', stand_id);
    }
  }

  const { error } = await supabase
    .from('stands')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', stand_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id } };
}

// ---------------------------------------------------------------------------
// P6.x.3 — updateStandPositionAction (admin calibration plan Canva)
// ---------------------------------------------------------------------------
//
// Bornes 0-100 (% relatifs au plan Canva). Validation Zod stricte pour
// eviter qu'un input UI buggy ne pose une position hors plan.

const positionSchema = z.object({
  stand_id: z.string().uuid(),
  position_x: z.number().min(0).max(100),
  position_y: z.number().min(0).max(100),
  position_w: z.number().min(0).max(100),
  position_h: z.number().min(0).max(100),
});

export async function updateStandPositionAction(
  input: z.infer<typeof positionSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Forbidden' };
  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  const { stand_id, position_x, position_y, position_w, position_h } = parsed.data;
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('stands')
    .update({
      position_x,
      position_y,
      position_w,
      position_h,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stand_id);
  if (error) return { ok: false, error: error.message };
  console.log(
    '%s position-updated stand=%s x=%s y=%s w=%s h=%s',
    LOG_PREFIX,
    stand_id,
    position_x,
    position_y,
    position_w,
    position_h,
  );
  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id } };
}

const createSchema = z.object({
  number: z.string().trim().min(1).max(40),
  salle: z.enum(SALLE_VALUES),
  taille_m2: z.number().positive().max(999),
  pole_recommended: z.enum(POLE_VALUES).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function createStandAction(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Forbidden' };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('stands')
    .insert({
      number: parsed.data.number,
      salle: parsed.data.salle,
      taille_m2: parsed.data.taille_m2,
      pole_recommended: parsed.data.pole_recommended ?? null,
      notes: parsed.data.notes ?? null,
      status: 'libre',
    })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: `Un stand "${parsed.data.number}" existe déjà dans cette salle.` };
    }
    return { ok: false, error: error?.message ?? 'Insert failed' };
  }

  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id: data.id } };
}

const deleteSchema = z.object({ stand_id: z.string().uuid() });

export async function deleteStandAction(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) return { ok: false, error: 'Forbidden' };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = getSupabaseServiceClient();
  const { data: stand } = await supabase
    .from('stands')
    .select('prospect_id')
    .eq('id', parsed.data.stand_id)
    .maybeSingle();
  if (!stand) return { ok: false, error: 'Stand introuvable.' };
  if (stand.prospect_id) {
    return {
      ok: false,
      error: 'Stand assigné à un prospect — retirez d’abord l’assignation avant de supprimer.',
    };
  }

  const { error } = await supabase.from('stands').delete().eq('id', parsed.data.stand_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id: parsed.data.stand_id } };
}

/**
 * Sync helper : appelé par updateProspectStatusAction quand le statut
 * prospect change. Met à jour le stand assigné en conséquence (reserve→paye
 * sur acompte_paye, libère sur perdu).
 *
 * Pas une server action externe — utilisé en interne, pas d'auth check.
 * Reste dans le module pour cohésion logique.
 */
export async function syncStandStatusFromProspect(prospectId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, status')
    .eq('id', prospectId)
    .maybeSingle();
  if (!prospect) return;

  // P6.x.MultiBooths : un prospect peut détenir N stands → on les traite tous
  // (l'ancien `.maybeSingle()` levait une erreur dès le 2e stand).
  const { data: stands } = await supabase
    .from('stands')
    .select('id, status, prospect_id')
    .eq('prospect_id', prospectId);
  if (!stands || stands.length === 0) return;

  const now = new Date().toISOString();
  const computed = standStatusForProspectStatus(prospect.status);

  if (computed === 'release') {
    // Prospect perdu → libère TOUS les stands
    const ids = stands.map((s) => s.id);
    await supabase
      .from('stands')
      .update({ prospect_id: null, status: 'libre', updated_at: now })
      .in('id', ids);
    await supabase
      .from('prospects')
      .update({ booth_assignment: null, booth_assigned_at: null, booth_assigned_by: null })
      .eq('id', prospectId);
    console.log('%s released-on-perdu stands=%d prospect=%s', LOG_PREFIX, ids.length, prospectId);
    return;
  }

  // Aligne en une passe tous les stands dont le statut diverge.
  const toUpdate = stands.filter((s) => s.status !== computed).map((s) => s.id);
  if (toUpdate.length === 0) return; // déjà à jour
  await supabase.from('stands').update({ status: computed, updated_at: now }).in('id', toUpdate);
  console.log(
    '%s status-synced stands=%d prospect=%s status→%s',
    LOG_PREFIX,
    toUpdate.length,
    prospectId,
    computed,
  );
}
