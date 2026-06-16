'use server';

/**
 * P15.4 — workflow lettre d'invitation visa (hybride auto / validation manuelle).
 *
 *   submitVisitorInvitationRequestAction : visiteur soumet sa demande.
 *     - pays low-risk → auto_approved + PDF généré + email lettre.
 *     - pays à risque → pending + notif super_admin + email "en cours".
 *   adminApproveInvitationAction (super_admin) : génère le PDF + email lettre.
 *   adminRejectInvitationAction  (super_admin) : refuse + email motif.
 *
 * Conventions : getSupabaseServiceClient, requireVisitorSession().visitorId,
 * users.full_name, audit_log (action enum + after.kind), Resend.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireVisitorSession } from '@/lib/espace-visiteur/session';
import { requireSuperAdmin } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { generateInvitationPdf } from '@/lib/pdf/generate-invitation';
import type { InvitationRecipient } from '@/lib/pdf/visitor-invitation-letter';
import { uploadInvitationPdf, getInvitationPdfSignedUrl } from '@/lib/storage/visitor-invitations';
import { isLowRiskCountry } from '@/lib/visitors/visa-countries';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';

const SIGNED_URL_TTL = 30 * 24 * 3600; // 30 jours pour les liens email

const submitSchema = z.object({
  passport_number: z.string().trim().min(3).max(50),
  passport_country: z.string().trim().length(2).toUpperCase(),
  passport_issue_date: z.string().trim().min(4).max(20),
  passport_expiry: z.string().trim().min(4).max(20),
  birth_date: z.string().trim().min(4).max(20),
  birth_place: z.string().trim().max(120).optional(),
  nationality: z.string().trim().min(2).max(80),
  profession: z.string().trim().min(2).max(120),
  company_name: z.string().trim().min(1).max(200),
  company_full_address: z.string().trim().min(1).max(500),
  postal_code: z.string().trim().max(20),
  city: z.string().trim().max(100),
  country: z.string().trim().max(80),
});

export type SubmitInvitationInput = z.input<typeof submitSchema>;

type ContactLite = { first_name: string | null; last_name: string | null; email: string };

function localizedToday(locale: 'fr' | 'en'): string {
  return new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function toRecipient(fields: z.infer<typeof submitSchema>): InvitationRecipient {
  return {
    company_name: fields.company_name,
    company_full_address: fields.company_full_address,
    postal_code: fields.postal_code,
    city: fields.city,
    country: fields.country,
    nationality: fields.nationality,
    birth_date: fields.birth_date,
    birth_place: fields.birth_place ?? null,
    profession: fields.profession,
    passport_number: fields.passport_number,
    passport_issue_date: fields.passport_issue_date,
    passport_expiry: fields.passport_expiry,
  };
}

/** Génère le PDF, l'upload, met à jour la DB et envoie l'email lettre au visiteur. */
async function generateAndStorePdf(
  invitationDataId: string,
  visitorId: string,
  fields: z.infer<typeof submitSchema>,
  locale: 'fr' | 'en',
  contact: ContactLite,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const pdf = await generateInvitationPdf({
    locale,
    generatedDate: localizedToday(locale),
    recipient: toRecipient(fields),
  });

  const storagePath = await uploadInvitationPdf(visitorId, locale, pdf);

  await supabase
    .from('visitor_invitation_data')
    .update({ pdf_storage_path: storagePath, pdf_generated_at: new Date().toISOString() })
    .eq('id', invitationDataId);

  const signedUrl = await getInvitationPdfSignedUrl(storagePath, SIGNED_URL_TTL);
  const firstName = contact.first_name ?? '';

  await sendTransactionalEmailViaResend({
    to: contact.email,
    toName: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || undefined,
    subject:
      locale === 'fr'
        ? "Votre lettre d'invitation officielle MDS 2026"
        : 'Your MDS 2026 Official Invitation Letter',
    html:
      locale === 'fr'
        ? `<p>Bonjour ${firstName},</p><p>Votre lettre d'invitation officielle pour le salon MediaDays Solutions 2026 est prête.</p><p style="margin:24px 0"><a href="${signedUrl}" style="display:inline-block;background:#031a56;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Télécharger ma lettre (PDF)</a></p><p style="font-size:12px;color:#666">Ce lien expire dans 30 jours. Vous pouvez aussi la retélécharger depuis votre Espace Visiteur.</p><p>Cordialement,<br/>Philippe Chapot</p>`
        : `<p>Hello ${firstName},</p><p>Your official invitation letter for MediaDays Solutions 2026 is ready.</p><p style="margin:24px 0"><a href="${signedUrl}" style="display:inline-block;background:#031a56;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Download my letter (PDF)</a></p><p style="font-size:12px;color:#666">This link expires in 30 days. You can also re-download it from your Visitor Portal.</p><p>Best regards,<br/>Philippe Chapot</p>`,
    text: `${locale === 'fr' ? 'Lettre PDF' : 'PDF letter'} : ${signedUrl}`,
    tags: [
      { name: 'category', value: 'visitor_invitation_letter' },
      { name: 'locale', value: locale },
    ],
  });
}

async function notifyAdminsForValidation(
  visitorId: string,
  contact: ContactLite,
  fields: z.infer<typeof submitSchema>,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { data: admins } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('role', 'super_admin');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const ficheUrl = `${baseUrl}/admin/visitors/${visitorId}`;
  const visitorName =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email;

  for (const a of admins ?? []) {
    if (!a.email) continue;
    const firstName = a.full_name?.trim()?.split(/\s+/)[0] ?? '';
    try {
      await sendTransactionalEmailViaResend({
        to: a.email,
        toName: a.full_name ?? undefined,
        subject: `🛂 Demande d'invitation officielle MDS — Validation requise (${fields.passport_country})`,
        html: `<p>Bonjour ${firstName},</p><p>Une nouvelle demande d'invitation officielle nécessite votre validation manuelle (pays à risque visa).</p><p><strong>Visiteur :</strong> ${visitorName} (${contact.email})<br/><strong>Nationalité :</strong> ${fields.nationality}<br/><strong>Pays passeport :</strong> ${fields.passport_country}<br/><strong>Société :</strong> ${fields.company_name}</p><p style="margin:24px 0"><a href="${ficheUrl}" style="display:inline-block;background:#031a56;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Voir la demande dans l'admin</a></p>`,
        text: `Demande invitation à valider : ${visitorName} (${fields.passport_country}). ${ficheUrl}`,
        tags: [{ name: 'category', value: 'visitor_invitation_validation' }],
      });
    } catch {
      // best-effort
    }
  }
}

async function loadVisitorWithContact(visitorId: string): Promise<{
  language: string;
  contact: ContactLite | null;
} | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('visitors')
    .select('id, language, contact:contacts!visitors_contact_id_fkey(first_name, last_name, email)')
    .eq('id', visitorId)
    .maybeSingle();
  if (!data) return null;
  const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
  return { language: data.language, contact: (contact as ContactLite) ?? null };
}

// ─── VISITEUR : soumet la demande ─────────────────────────────────────────
export async function submitVisitorInvitationRequestAction(
  locale: 'fr' | 'en',
  input: SubmitInvitationInput,
): Promise<{ success: true; auto_approved: boolean; status: 'auto_approved' | 'pending' }> {
  const session = await requireVisitorSession(locale);
  const parsed = submitSchema.parse(input);
  const supabase = getSupabaseServiceClient();

  const visitor = await loadVisitorWithContact(session.visitorId);
  if (!visitor?.contact) throw new Error('Visiteur introuvable.');
  const letterLocale: 'fr' | 'en' = visitor.language === 'en' ? 'en' : 'fr';

  const lowRisk = isLowRiskCountry(parsed.passport_country);
  const approvalStatus: 'auto_approved' | 'pending' = lowRisk ? 'auto_approved' : 'pending';

  const { data: invitationData, error: upsertError } = await supabase
    .from('visitor_invitation_data')
    .upsert(
      {
        visitor_id: session.visitorId,
        ...parsed,
        approval_status: approvalStatus,
        approved_at: lowRisk ? new Date().toISOString() : null,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'visitor_id' },
    )
    .select('id')
    .single();

  if (upsertError || !invitationData) {
    throw new Error(`upsert invitation data: ${upsertError?.message ?? 'unknown'}`);
  }

  if (lowRisk) {
    await generateAndStorePdf(
      invitationData.id,
      session.visitorId,
      parsed,
      letterLocale,
      visitor.contact,
    );
  } else {
    await notifyAdminsForValidation(session.visitorId, visitor.contact, parsed);
    await sendTransactionalEmailViaResend({
      to: visitor.contact.email,
      subject:
        letterLocale === 'fr'
          ? "Votre demande d'invitation officielle MDS — En cours de traitement"
          : 'Your MDS official invitation request — Being processed',
      html:
        letterLocale === 'fr'
          ? `<p>Bonjour,</p><p>Votre demande de lettre d'invitation officielle pour MediaDays Solutions 2026 a bien été reçue. En raison de votre pays d'origine, elle nécessite une validation manuelle.</p><p>Notre équipe la traitera sous 48 heures ouvrées. Vous recevrez un email avec votre lettre dès validation.</p><p>Cordialement,<br/>L'équipe MediaDays Solutions</p>`
          : `<p>Hello,</p><p>Your request for an official invitation letter to MediaDays Solutions 2026 has been received. Due to your country of origin, it requires manual validation.</p><p>Our team will process it within 48 business hours. You will receive an email with your letter once validated.</p><p>Best regards,<br/>The MediaDays Solutions team</p>`,
      text:
        letterLocale === 'fr'
          ? 'Votre demande est en cours de traitement (48h ouvrées).'
          : 'Your request is being processed (48 business hours).',
      tags: [{ name: 'category', value: 'visitor_invitation_pending' }],
    });
  }

  await supabase.from('audit_log').insert({
    user_id: null,
    action: 'create',
    entity_type: 'visitors',
    entity_id: session.visitorId,
    before: null,
    after: {
      kind: 'visitor_invitation_request_submitted',
      auto_approved: lowRisk,
      passport_country: parsed.passport_country,
    },
  });

  revalidatePath(`/admin/visitors/${session.visitorId}`);
  return { success: true, auto_approved: lowRisk, status: approvalStatus };
}

// ─── ADMIN : approuver (super_admin) ───────────────────────────────────────
export async function adminApproveInvitationAction(input: {
  visitor_id: string;
}): Promise<{ success: true }> {
  const admin = await requireSuperAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(input.visitor_id)) throw new Error('ID visiteur invalide.');
  const supabase = getSupabaseServiceClient();

  const { data: inv } = await supabase
    .from('visitor_invitation_data')
    .select('*')
    .eq('visitor_id', input.visitor_id)
    .maybeSingle();
  if (!inv) throw new Error("Demande d'invitation introuvable.");
  if (inv.approval_status === 'approved' || inv.approval_status === 'auto_approved') {
    throw new Error('Demande déjà approuvée.');
  }

  const visitor = await loadVisitorWithContact(input.visitor_id);
  if (!visitor?.contact) throw new Error('Visiteur introuvable.');
  const letterLocale: 'fr' | 'en' = visitor.language === 'en' ? 'en' : 'fr';

  await supabase
    .from('visitor_invitation_data')
    .update({
      approval_status: 'approved',
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inv.id);

  // `inv` contient désormais toutes les colonnes (identité + société).
  await generateAndStorePdf(
    inv.id,
    input.visitor_id,
    inv as unknown as z.infer<typeof submitSchema>,
    letterLocale,
    visitor.contact,
  );

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'visitors',
    entity_id: input.visitor_id,
    before: null,
    after: { kind: 'invitation_approved_by_admin' },
  });

  revalidatePath(`/admin/visitors/${input.visitor_id}`);
  return { success: true };
}

// ─── ADMIN : refuser (super_admin) ─────────────────────────────────────────
export async function adminRejectInvitationAction(input: {
  visitor_id: string;
  reason: string;
}): Promise<{ success: true }> {
  const admin = await requireSuperAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(input.visitor_id)) throw new Error('ID visiteur invalide.');
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) throw new Error('Motif requis.');
  const supabase = getSupabaseServiceClient();

  const { data: inv } = await supabase
    .from('visitor_invitation_data')
    .select('id')
    .eq('visitor_id', input.visitor_id)
    .maybeSingle();
  if (!inv) throw new Error("Demande d'invitation introuvable.");

  await supabase
    .from('visitor_invitation_data')
    .update({
      approval_status: 'rejected',
      approved_by: admin.id,
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inv.id);

  const visitor = await loadVisitorWithContact(input.visitor_id);
  const letterLocale: 'fr' | 'en' = visitor?.language === 'en' ? 'en' : 'fr';

  if (visitor?.contact?.email) {
    await sendTransactionalEmailViaResend({
      to: visitor.contact.email,
      subject:
        letterLocale === 'fr'
          ? "Votre demande d'invitation officielle MDS"
          : 'Your MDS official invitation request',
      html:
        letterLocale === 'fr'
          ? `<p>Bonjour,</p><p>Après examen, nous ne sommes pas en mesure de donner suite à votre demande de lettre d'invitation officielle pour MediaDays Solutions 2026.</p><p><strong>Motif :</strong> ${reason}</p><p>Cordialement,<br/>L'équipe MediaDays Solutions</p>`
          : `<p>Hello,</p><p>After review, we are unable to proceed with your request for an official invitation letter to MediaDays Solutions 2026.</p><p><strong>Reason:</strong> ${reason}</p><p>Best regards,<br/>The MediaDays Solutions team</p>`,
      text: `${letterLocale === 'fr' ? 'Demande refusée' : 'Request rejected'} : ${reason}`,
      tags: [{ name: 'category', value: 'visitor_invitation_rejected' }],
    });
  }

  await supabase.from('audit_log').insert({
    user_id: admin.id,
    action: 'update',
    entity_type: 'visitors',
    entity_id: input.visitor_id,
    before: null,
    after: { kind: 'invitation_rejected_by_admin', reason },
  });

  revalidatePath(`/admin/visitors/${input.visitor_id}`);
  return { success: true };
}
