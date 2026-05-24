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
import { hasAdminAccess } from '@/lib/auth/role-helpers';

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
  if (!hasAdminAccess(profile.role)) {
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
  if (!hasAdminAccess(profile.role)) {
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
  if (!hasAdminAccess(profile.role)) {
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
  if (!hasAdminAccess(profile.role)) {
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

  const paidAt = new Date().toISOString();
  const reference = paymentReference?.trim() || null;
  const { error } = await supabase
    .from('prospects')
    .update({
      commission_status: 'paid',
      commission_paid_at: paidAt,
      commission_payment_reference: reference,
    })
    .eq('id', prospectId);

  if (error) throw new Error(error.message);

  // P7.x.1.C — notifier l'affilie que le virement a ete effectue.
  // Best-effort : si Resend ou la lecture de l'affilie echoue, on log et
  // n'echoue pas l'action admin (la commission est deja marquee payee).
  if (reference && prospect.affiliate_id) {
    try {
      const { data: affiliate } = await supabase
        .from('affiliates')
        .select('id, display_name, contact_email, iban')
        .eq('id', prospect.affiliate_id)
        .maybeSingle();
      if (affiliate?.contact_email) {
        const { renderAffilieCommissionPaid } =
          await import('@/lib/resend/templates/affilie-commission-paid');
        const { sendTransactionalEmailViaResend } = await import('@/lib/resend/client');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
        const tpl = renderAffilieCommissionPaid({
          affilieName: affiliate.display_name,
          amountEurHt: Number(prospect.commission_eur_ht ?? 0),
          paidAt,
          paymentReference: reference,
          iban: affiliate.iban,
          dashboardUrl: `${baseUrl}/fr/affilie`,
        });
        await sendTransactionalEmailViaResend({
          to: affiliate.contact_email,
          toName: affiliate.display_name,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: 'category', value: 'affilie_commission_paid' }],
        });
        console.log(
          '[admin/affiliates] paid-email-sent affiliate=%s amount=%s ref=%s',
          prospect.affiliate_id,
          prospect.commission_eur_ht,
          reference,
        );
      }
    } catch (mailErr) {
      console.warn(
        '[admin/affiliates] paid-email-failed affiliate=%s msg=%s',
        prospect.affiliate_id,
        mailErr instanceof Error ? mailErr.message : String(mailErr),
      );
    }
  }

  revalidatePath(`/admin/affiliates/${prospect.affiliate_id}`);
  revalidatePath('/admin/affiliates');
  revalidatePath(`/admin/prospects/${prospectId}`);
}
