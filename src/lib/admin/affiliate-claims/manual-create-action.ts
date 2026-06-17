'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const schema = z
  .object({
    affiliate_id: z.string().uuid(),
    company_id: z.string().uuid().optional(),
    prospect_id: z.string().uuid().optional(),
    notes_admin: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.company_id || d.prospect_id, {
    message: 'Au moins company_id ou prospect_id est requis.',
  });

export type ManualClaimResult =
  | { ok: true; claim_id: string }
  | { ok: false; error: string; existing_claim_id?: string };

export async function createManualAffiliateClaimAction(
  input: z.infer<typeof schema>,
): Promise<ManualClaimResult> {
  let actorId: string;
  try {
    const profile = await requireAdminProfile();
    actorId = profile.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Forbidden' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const { affiliate_id, company_id, prospect_id, notes_admin } = parsed.data;
  const supabase = getSupabaseServiceClient();

  // Anti-doublon : claim pending ou active sur cette paire affilié + entité.
  let dupQuery = supabase
    .from('affiliate_claims')
    .select('id, status')
    .eq('affiliate_id', affiliate_id)
    .in('status', ['pending', 'active']);
  if (company_id) dupQuery = dupQuery.eq('company_id', company_id);
  else if (prospect_id) dupQuery = dupQuery.eq('prospect_id', prospect_id);

  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: 'Un claim actif ou en attente existe déjà pour cette combinaison.',
      existing_claim_id: existing.id,
    };
  }

  // Propage affiliate_id au prospect si pas encore set.
  if (prospect_id) {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('affiliate_id')
      .eq('id', prospect_id)
      .maybeSingle();
    if (prospect && !prospect.affiliate_id) {
      await supabase.from('prospects').update({ affiliate_id }).eq('id', prospect_id);
    }
  }

  // Insert claim.
  const now = new Date().toISOString();
  const { data: newClaim, error: insErr } = await supabase
    .from('affiliate_claims')
    .insert({
      affiliate_id,
      company_id: company_id ?? null,
      prospect_id: prospect_id ?? null,
      source: 'manual_admin',
      status: 'active',
      validated_at: now,
      validated_by: actorId,
      notes_admin: notes_admin ?? null,
    })
    .select('id')
    .single();

  if (insErr || !newClaim) {
    return { ok: false, error: insErr?.message ?? 'Échec de création du claim.' };
  }

  // Audit log (best-effort).
  try {
    await supabase.from('audit_log').insert({
      user_id: actorId,
      action: 'create',
      entity_type: 'affiliate_claims',
      entity_id: newClaim.id,
      after: {
        kind: 'affiliate_claim_manual_created',
        affiliate_id,
        company_id: company_id ?? null,
        prospect_id: prospect_id ?? null,
      } as never,
    });
  } catch {
    // ignore
  }

  if (company_id) revalidatePath(`/admin/companies/${company_id}`);
  if (prospect_id) revalidatePath(`/admin/prospects/${prospect_id}`);
  revalidatePath('/admin/affiliate-claims');

  return { ok: true, claim_id: newClaim.id };
}
