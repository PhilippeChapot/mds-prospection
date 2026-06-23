'use server';

/**
 * P5.x.SellsyDocumentsFlow — demande de document (pro-forma / facture) par
 * un partenaire depuis l'espace partenaire.
 *
 * Flow :
 *   1. Auth via session espace partenaire → { contactId, prospectId }
 *   2. Validation Zod (BC obligatoire si requires_purchase_order)
 *   3. Anti-doublon : pas 2 demandes pending même (prospect, contact, type)
 *      (aussi garanti par l'index unique partiel migration 0103)
 *   4. INSERT document_requests (status='pending')
 *   5. Notification Resend best-effort à l'admin
 *
 * MDS Prospection ne crée PAS le document ici : un admin valide la demande
 * côté /admin puis émet le document Sellsy (emitSellsyTypedDocumentAction).
 *
 * Note 'use server' : ce fichier n'exporte que des fonctions async (le schéma
 * Zod reste local). Cf. doctrine pnpm-build-before-push-server-files.
 */

import { z } from 'zod';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';

const LOG_PREFIX = '[espace-partenaire/document-requests]';

const submitSchema = z
  .object({
    locale: z.enum(['fr', 'en']).default('fr'),
    document_type: z.enum(['proforma', 'invoice']),
    requires_purchase_order: z.boolean().default(false),
    purchase_order_number: z.string().trim().max(100).nullable().optional(),
    requested_billing_contact_id: z.string().uuid().nullable().optional(),
    requested_billing_email: z.string().email().nullable().optional(),
    requested_note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => !d.requires_purchase_order || !!d.purchase_order_number?.trim(), {
    message: 'Numéro de bon de commande requis.',
    path: ['purchase_order_number'],
  });

type SubmitResult = { ok: true; request_id: string } | { ok: false; error: string };

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

export async function submitDocumentRequestAction(input: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Paramètres invalides' };
  }
  const data = parsed.data;

  // Auth + résolution prospect/contact depuis la session (jamais depuis le client).
  const { contactId, prospectId } = await requireContactSession(data.locale);
  if (!prospectId) {
    return { ok: false, error: 'Aucun dossier partenaire actif lié à votre compte.' };
  }
  if (!contactId) {
    return { ok: false, error: 'Contact introuvable pour votre session.' };
  }

  const supabase = getSupabaseServiceClient();

  // Anti-doublon applicatif (message friendly ; l'index unique est le garde-fou final).
  const { data: existing } = await asAnyDb(supabase)
    .from('document_requests')
    .select('id')
    .eq('prospect_id', prospectId)
    .eq('contact_id', contactId)
    .eq('document_type', data.document_type)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: 'Vous avez déjà une demande en attente pour ce type de document.',
    };
  }

  const po = data.requires_purchase_order ? (data.purchase_order_number?.trim() ?? null) : null;

  const { data: req, error } = await asAnyDb(supabase)
    .from('document_requests')
    .insert({
      prospect_id: prospectId,
      contact_id: contactId,
      document_type: data.document_type,
      requires_purchase_order: data.requires_purchase_order,
      purchase_order_number: po,
      requested_billing_contact_id: data.requested_billing_contact_id ?? null,
      requested_billing_email: data.requested_billing_email ?? null,
      requested_note: data.requested_note?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !req) {
    console.error('%s insert-failed prospect=%s msg=%s', LOG_PREFIX, prospectId, error?.message);
    return { ok: false, error: "La demande n'a pas pu être enregistrée. Réessayez." };
  }

  // Notification admin (best-effort).
  await notifyAdminOfRequest({
    prospectId,
    contactId,
    documentType: data.document_type,
    purchaseOrderNumber: po,
    requestedNote: data.requested_note?.trim() || null,
  });

  console.log(
    '%s submitted prospect=%s contact=%s type=%s request=%s',
    LOG_PREFIX,
    prospectId,
    contactId,
    data.document_type,
    req.id,
  );
  return { ok: true, request_id: req.id as string };
}

async function notifyAdminOfRequest(args: {
  prospectId: string;
  contactId: string;
  documentType: 'proforma' | 'invoice';
  purchaseOrderNumber: string | null;
  requestedNote: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: prospect } = await supabase
      .from('prospects')
      .select('id, company:companies!inner(name)')
      .eq('id', args.prospectId)
      .maybeSingle();
    const companyName =
      (Array.isArray(prospect?.company) ? prospect?.company[0] : prospect?.company)?.name ??
      'Société inconnue';

    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', args.contactId)
      .maybeSingle();
    const requesterName =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() ||
      contact?.email ||
      args.contactId;

    const label = args.documentType === 'proforma' ? 'pro-forma' : 'facture';
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'philippe@mediadays.solutions';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
    const prospectUrl = `${appUrl}/admin/prospects/${args.prospectId}`;

    const lines = [
      `Demande de ${label} via l'espace partenaire.`,
      `Société : ${companyName}`,
      `Demandeur : ${requesterName}`,
      args.purchaseOrderNumber
        ? `Bon de commande : ${args.purchaseOrderNumber}`
        : 'Pas de bon de commande',
      args.requestedNote ? `Note : ${args.requestedNote}` : null,
    ].filter(Boolean) as string[];

    const html = `<p>${lines.map((l) => escapeHtml(l)).join('<br/>')}</p><p><a href="${prospectUrl}">Voir la fiche prospect</a></p>`;
    const text = `${lines.join('\n')}\n\n${prospectUrl}`;

    await sendTransactionalEmailViaResend({
      to: adminEmail,
      subject: `📩 Demande de ${label} — ${companyName}`,
      html,
      text,
      tags: [{ name: 'category', value: 'document_request' }],
    });
  } catch (err) {
    console.warn(
      '%s notify-failed prospect=%s msg=%s',
      LOG_PREFIX,
      args.prospectId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
