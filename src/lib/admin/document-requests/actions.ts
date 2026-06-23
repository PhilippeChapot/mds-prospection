'use server';

/**
 * P5.x.SellsyDocumentsFlow — décision admin sur une demande de document.
 *
 * Le « ✅ Émettre » d'une demande appelle directement
 * emitSellsyTypedDocumentAction({ ..., request_id }) qui passe la demande
 * en 'approved'. Ici on couvre le « ❌ Refuser ».
 *
 * Note 'use server' : exporte uniquement des fonctions async (schéma local).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

const rejectSchema = z.object({
  request_id: z.string().uuid(),
  prospect_id: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional(),
});

type RejectResult = { ok: true } | { ok: false; error: string };

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

export async function rejectDocumentRequestAction(input: unknown): Promise<RejectResult> {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    return { ok: false, error: 'Seul un admin peut refuser une demande.' };
  }
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await asAnyDb(supabase)
    .from('document_requests')
    .update({
      status: 'rejected',
      decided_by_user_id: profile.id,
      decided_at: now,
      decided_note: parsed.data.note?.trim() || null,
      updated_at: now,
    })
    .eq('id', parsed.data.request_id)
    .eq('status', 'pending');

  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    action: 'update',
    entity_type: 'document_request',
    entity_id: parsed.data.request_id,
    after: {
      kind: 'document_request_rejected',
      prospect_id: parsed.data.prospect_id,
      note: parsed.data.note?.trim() || null,
    } as never,
  });

  revalidatePath(`/admin/prospects/${parsed.data.prospect_id}`);
  return { ok: true };
}
