'use server';

/**
 * P14.3.ProspectTimelineDrawer — server actions notes prospect.
 *
 * Doctrine [[feedback_pnpm_build_before_push_server_files]] : ce fichier
 * 'use server' n exporte QUE des async functions. Les types + helpers
 * sync vivent dans ./timeline-helpers.ts.
 *
 * RBAC :
 *   - Create : tout admin/sales/super_admin.
 *   - Soft-delete : author OR super_admin uniquement (la note reste en
 *     DB pour audit, juste masquee de la view).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { validateContactBelongsToProspect } from './timeline-helpers';

const createSchema = z.object({
  prospect_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(10000),
});

const deleteSchema = z.object({ id: z.string().uuid() });

export type NoteActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; errorCode?: 'validation' | 'forbidden' | 'not_found' | 'internal' };

// ─── Create ───────────────────────────────────────────────────────────

export async function createProspectNoteAction(
  input: z.input<typeof createSchema>,
): Promise<NoteActionResult> {
  const profile = await requireAdminProfile();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Donnees invalides',
      errorCode: 'validation',
    };
  }
  const data = parsed.data;

  // Validation contact ↔ company du prospect (anti-bug client).
  if (data.contact_id) {
    const isValid = await validateContactBelongsToProspect(data.contact_id, data.prospect_id);
    if (!isValid) {
      return {
        ok: false,
        error: 'Ce contact n appartient pas a la societe du prospect.',
        errorCode: 'validation',
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;
  const { data: created, error } = await supabase
    .from('prospect_notes')
    .insert({
      prospect_id: data.prospect_id,
      author_user_id: profile.id,
      contact_id: data.contact_id ?? null,
      content: data.content,
    })
    .select('id')
    .single();
  if (error) {
    return { ok: false, error: `Create: ${error.message}`, errorCode: 'internal' };
  }

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'prospect_notes',
    entity_id: created.id,
    action: 'create',
    after: {
      kind: 'prospect_note_created',
      prospect_id: data.prospect_id,
      contact_id: data.contact_id ?? null,
    },
  });

  revalidatePath(`/admin/prospects/${data.prospect_id}`);
  return { ok: true, id: created.id };
}

// ─── Soft delete ──────────────────────────────────────────────────────

export async function softDeleteProspectNoteAction(
  input: z.input<typeof deleteSchema>,
): Promise<NoteActionResult> {
  const profile = await requireAdminProfile();
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'id invalide', errorCode: 'validation' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServiceClient() as any;

  // Lit la note pour verifier ownership + recuperer prospect_id pour revalidate.
  const { data: note } = await supabase
    .from('prospect_notes')
    .select('id, prospect_id, author_user_id, deleted_at')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!note) return { ok: false, error: 'Note introuvable.', errorCode: 'not_found' };

  // RBAC : author OR super_admin.
  const isAuthor = note.author_user_id === profile.id;
  const isSuperAdmin = profile.role === 'super_admin';
  if (!isAuthor && !isSuperAdmin) {
    return {
      ok: false,
      error: "Reserve a l'auteur ou au super_admin.",
      errorCode: 'forbidden',
    };
  }

  if (note.deleted_at) {
    return { ok: false, error: 'Note deja supprimee.', errorCode: 'validation' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('prospect_notes')
    .update({ deleted_at: now, deleted_by: profile.id, updated_at: now })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message, errorCode: 'internal' };

  await supabase.from('audit_log').insert({
    user_id: profile.id,
    entity_type: 'prospect_notes',
    entity_id: parsed.data.id,
    action: 'delete',
    after: { kind: 'prospect_note_soft_deleted', by_super_admin: isSuperAdmin },
  });

  revalidatePath(`/admin/prospects/${note.prospect_id}`);
  return { ok: true, id: parsed.data.id };
}
