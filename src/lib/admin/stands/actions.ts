'use server';

/**
 * P6.x.2a — server actions stands (catalogue + assignation).
 *
 * Workflow assignation :
 *   1. assignStandToProspectAction(stand_id, prospect_id) :
 *      - Si stand pas libre → erreur
 *      - Si prospect a déjà un stand → on retire d'abord l'ancien
 *      - UPDATE stand : prospect_id + status calculé selon prospect.status
 *      - UPDATE prospect : booth_assignment = stand.number + booth_assigned_at
 *   2. removeStandFromProspectAction(stand_id) : reset prospect_id + status='libre'
 *
 * Sync statut prospect → stand : appelé par updateProspectStatusAction
 * (côté prospect actions.ts) via syncStandStatusFromProspectAction.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { standStatusForProspectStatus } from './queries';

const LOG_PREFIX = '[admin/stands]';

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const SALLE_VALUES = ['delorme', 'gabriel', 'le_notre', 'foyer', 'mezzanine', 'soufflot'] as const;
const STATUS_VALUES = ['libre', 'reserve', 'paye', 'bloque'] as const;
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
): Promise<ActionResult<{ stand_id: string; previous_stand_id: string | null }>> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin' && profile.role !== 'sales') {
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

  // 2. Lookup prospect + détection éventuel stand déjà assigné
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, status')
    .eq('id', prospect_id)
    .maybeSingle();
  if (pErr || !prospect) return { ok: false, error: 'Prospect introuvable.' };

  // Détecte un éventuel stand déjà assigné à ce prospect (autre que stand_id)
  let previousStandId: string | null = null;
  const { data: existing } = await supabase
    .from('stands')
    .select('id')
    .eq('prospect_id', prospect_id)
    .neq('id', stand_id)
    .maybeSingle();
  if (existing) {
    previousStandId = existing.id;
    // Soft re-assignation : retire l'ancien stand
    const { error: rErr } = await supabase
      .from('stands')
      .update({ prospect_id: null, status: 'libre', updated_at: new Date().toISOString() })
      .eq('id', previousStandId);
    if (rErr) {
      console.error(
        '%s release-previous-failed id=%s msg=%s',
        LOG_PREFIX,
        previousStandId,
        rErr.message,
      );
      return { ok: false, error: 'Impossible de libérer le stand précédent.' };
    }
  }

  // 3. Statut stand selon statut prospect
  const computed = standStatusForProspectStatus(prospect.status);
  if (computed === 'release') {
    return {
      ok: false,
      error: "Impossible d'assigner un stand à un prospect 'perdu'. Réactivez-le d'abord.",
    };
  }
  const newStatus: 'reserve' | 'paye' = computed;

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('stands')
    .update({ prospect_id, status: newStatus, updated_at: now })
    .eq('id', stand_id);
  if (updErr) {
    console.error('%s assign-failed stand=%s msg=%s', LOG_PREFIX, stand_id, updErr.message);
    return { ok: false, error: updErr.message };
  }

  // 4. Sync prospects.booth_assignment pour rétrocompat (P5.x.10)
  await supabase
    .from('prospects')
    .update({
      booth_assignment: stand.number,
      booth_assigned_at: now,
      booth_assigned_by: profile.id,
      last_activity_at: now,
    })
    .eq('id', prospect_id);

  console.log(
    '%s assigned stand=%s number=%s prospect=%s status=%s previous=%s',
    LOG_PREFIX,
    stand_id,
    stand.number,
    prospect_id,
    newStatus,
    previousStandId ?? '-',
  );

  revalidatePath(`/admin/prospects/${prospect_id}`);
  revalidatePath('/admin/emplacements');
  return { ok: true, data: { stand_id, previous_stand_id: previousStandId } };
}

const removeSchema = z.object({ stand_id: z.string().uuid() });

export async function removeStandFromProspectAction(
  input: z.infer<typeof removeSchema>,
): Promise<ActionResult<{ stand_id: string }>> {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin' && profile.role !== 'sales') {
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
    await supabase
      .from('prospects')
      .update({
        booth_assignment: null,
        booth_assigned_at: null,
        booth_assigned_by: null,
        last_activity_at: now,
      })
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
  if (profile.role !== 'admin') return { ok: false, error: 'Forbidden' };
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
  if (profile.role !== 'admin') return { ok: false, error: 'Forbidden' };
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
  if (profile.role !== 'admin') return { ok: false, error: 'Forbidden' };
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
  if (profile.role !== 'admin') return { ok: false, error: 'Forbidden' };
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

  const { data: stand } = await supabase
    .from('stands')
    .select('id, status, prospect_id')
    .eq('prospect_id', prospectId)
    .maybeSingle();
  if (!stand) return;

  const computed = standStatusForProspectStatus(prospect.status);
  if (computed === 'release') {
    // Prospect perdu → libère le stand
    const now = new Date().toISOString();
    await supabase
      .from('stands')
      .update({ prospect_id: null, status: 'libre', updated_at: now })
      .eq('id', stand.id);
    await supabase
      .from('prospects')
      .update({ booth_assignment: null, booth_assigned_at: null, booth_assigned_by: null })
      .eq('id', prospectId);
    console.log('%s released-on-perdu stand=%s prospect=%s', LOG_PREFIX, stand.id, prospectId);
    return;
  }

  if (stand.status === computed) return; // déjà à jour
  await supabase
    .from('stands')
    .update({ status: computed, updated_at: new Date().toISOString() })
    .eq('id', stand.id);
  console.log(
    '%s status-synced stand=%s prospect=%s status=%s→%s',
    LOG_PREFIX,
    stand.id,
    prospectId,
    stand.status,
    computed,
  );
}
