'use server';

/**
 * Server actions admin /admin/affiliates — P5.x.7
 *
 *   - createAffiliateAction      : INSERT + redirect /[id]
 *   - archiveAffiliateAction     : soft-delete via is_active=false
 *   - unarchiveAffiliateAction   : reactivate is_active=true
 *   - markCommissionPaidAction   : prospects.commission_status='paid'
 */

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Helper : token genere a partir du nom
// ---------------------------------------------------------------------------

/**
 * Normalise un nom en token UPPER_SNAKE alphanum + _.
 * Ex: "Podcast News" -> "PODCAST_NEWS", "Jean Dupont" -> "JEAN_DUPONT".
 */
export async function tokenFromDisplayName(name: string): Promise<string> {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return base || `AFF_${Date.now().toString(36).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// createAffiliateAction
// ---------------------------------------------------------------------------

const createSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  type: z.enum(['media', 'referral']),
  commissionPercent: z.coerce.number().min(0).max(100),
  token: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_.\-]+$/)
    .optional(),
  notesInternal: z.string().trim().max(2000).nullable().optional(),
});

export async function createAffiliateAction(formData: FormData) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Réservé aux admins.');
  }

  const parsed = createSchema.safeParse({
    displayName: formData.get('displayName'),
    contactEmail: formData.get('contactEmail') || null,
    type: formData.get('type') ?? 'media',
    commissionPercent: formData.get('commissionPercent') ?? 10,
    token: formData.get('token') || undefined,
    notesInternal: formData.get('notesInternal') || null,
  });

  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  const data = parsed.data;
  const token = data.token ?? (await tokenFromDisplayName(data.displayName));

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from('affiliates')
    .insert({
      display_name: data.displayName,
      display_name_normalized: data.displayName.toLowerCase().trim(),
      contact_email: data.contactEmail ?? null,
      type: data.type,
      commission_percent: data.commissionPercent,
      token,
      notes_internal: data.notesInternal ?? null,
      created_by_user_id: profile.id,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`INSERT affiliate: ${error?.message ?? 'unknown'}`);
  }

  revalidatePath('/admin/affiliates');
  redirect(`/admin/affiliates/${created.id}`);
}

// ---------------------------------------------------------------------------
// archiveAffiliateAction / unarchiveAffiliateAction
// ---------------------------------------------------------------------------

export async function archiveAffiliateAction(affiliateId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Réservé aux admins.');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('affiliates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', affiliateId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/affiliates');
  revalidatePath(`/admin/affiliates/${affiliateId}`);
}

export async function unarchiveAffiliateAction(affiliateId: string) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Réservé aux admins.');
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('affiliates')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', affiliateId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/affiliates');
  revalidatePath(`/admin/affiliates/${affiliateId}`);
}

// ---------------------------------------------------------------------------
// markCommissionPaidAction
// ---------------------------------------------------------------------------

export async function markCommissionPaidAction(
  prospectId: string,
  paymentReference?: string | null,
) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    throw new Error('Réservé aux admins.');
  }
  const supabase = await createSupabaseServerClient();
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, affiliate_id, commission_eur_ht, commission_status')
    .eq('id', prospectId)
    .maybeSingle();
  if (pErr || !prospect) {
    throw new Error('Prospect introuvable.');
  }
  if (!prospect.affiliate_id || prospect.commission_status !== 'due') {
    throw new Error('Aucune commission due sur ce prospect.');
  }

  const { error } = await supabase
    .from('prospects')
    .update({
      commission_status: 'paid',
      commission_paid_at: new Date().toISOString(),
      commission_payment_reference: paymentReference?.trim() || null,
    })
    .eq('id', prospectId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/affiliates/${prospect.affiliate_id}`);
  revalidatePath('/admin/affiliates');
  revalidatePath(`/admin/prospects/${prospectId}`);
}
