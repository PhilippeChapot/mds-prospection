'use server';

/**
 * P6.x.4-a — server action pour soumettre une demande de tarif
 * Institutionnel/École depuis la landing publique.
 *
 * Flow :
 *   1. Validate Zod
 *   2. INSERT public.institutionnel_ecole_requests (service-role)
 *   3. Send admin email (sendAdminNotification)
 *   4. Send confirmation client email (Resend direct)
 *
 * Tolérant aux erreurs email : si Resend échoue, la row reste créée
 * (l'admin peut toujours la voir dans /admin/demandes-institutionnel-ecole).
 */

import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import {
  renderAdminInstitutionnelEcoleRequest,
  renderClientInstitutionnelEcoleConfirmation,
  type RequestType,
} from '@/lib/resend/templates/institutionnel-ecole-request';

const LOG_PREFIX = '[landing/institutionnel-ecole]';

const submitSchema = z.object({
  type: z.enum(['institutionnel', 'ecole']),
  org_name: z.string().trim().min(2).max(200),
  contact_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().toLowerCase().email().max(180),
  contact_phone: z.string().trim().max(40).optional().or(z.literal('')),
  website: z.string().trim().max(300).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type SubmitInput = z.infer<typeof submitSchema>;
export type SubmitResult = { ok: true; request_id: string } | { ok: false; error: string };

export async function submitInstitutionnelEcoleRequest(input: SubmitInput): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('institutionnel_ecole_requests')
    .insert({
      type: data.type,
      org_name: data.org_name,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone || null,
      website: data.website || null,
      message: data.message || null,
    })
    .select('id, created_at')
    .single();

  if (error || !row) {
    console.error('%s insert-failed msg=%s', LOG_PREFIX, error?.message ?? 'unknown');
    return { ok: false, error: 'Impossible d’enregistrer la demande, réessayez plus tard.' };
  }

  console.log('%s inserted id=%s type=%s org=%s', LOG_PREFIX, row.id, data.type, data.org_name);

  // Best-effort emails
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const adminUrl = `${appUrl}/admin/demandes-institutionnel-ecole/${row.id}`;
  const requestType: RequestType = data.type;

  try {
    const adminTpl = renderAdminInstitutionnelEcoleRequest({
      type: requestType,
      orgName: data.org_name,
      contactName: data.contact_name,
      contactEmail: data.contact_email,
      contactPhone: data.contact_phone || null,
      website: data.website || null,
      message: data.message || null,
      requestId: row.id,
      adminUrl,
      createdAt: new Date(row.created_at).toLocaleString('fr-FR'),
    });
    await sendAdminNotification('admin_institutionnel_ecole_request', adminTpl);
  } catch (err) {
    console.warn(
      '%s admin-email-failed id=%s msg=%s',
      LOG_PREFIX,
      row.id,
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    const clientTpl = renderClientInstitutionnelEcoleConfirmation({
      type: requestType,
      contactName: data.contact_name,
      orgName: data.org_name,
    });
    await sendTransactionalEmailViaResend({
      to: data.contact_email,
      toName: data.contact_name,
      subject: clientTpl.subject,
      html: clientTpl.html,
      text: clientTpl.text,
      tags: [{ name: 'category', value: 'institutionnel_ecole_confirmation' }],
    });
  } catch (err) {
    console.warn(
      '%s client-email-failed id=%s msg=%s',
      LOG_PREFIX,
      row.id,
      err instanceof Error ? err.message : String(err),
    );
  }

  return { ok: true, request_id: row.id };
}
