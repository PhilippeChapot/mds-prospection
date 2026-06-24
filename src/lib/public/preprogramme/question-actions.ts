'use server';

/**
 * P16.x.PreProgrammeQuestionDrawer — soumission d'une question depuis le
 * drawer du pré-programme. Réutilise le PIPELINE lead existant (helpers
 * findOrCreate company/contact de lead-actions) → même destination que les
 * leads landing, mais avec source_detail dédié pour les différencier.
 *
 * On ne réutilise PAS createLeadFromLandingForm directement : elle est couplée
 * au RequestType (emails institutionnel/école/bruxelles spécifiques). Ici :
 * source_detail='preprogramme_drawer' + email admin best-effort générique.
 *
 * Note 'use server' : exporte uniquement des fonctions async.
 */

import { z } from 'zod';
import {
  findOrCreateCompanyForLanding,
  findOrCreateContactForLanding,
} from '@/lib/landing/lead-actions';
import { getActiveSeasonId } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';

const LOG_PREFIX = '[preprogramme/question]';

const questionSchema = z.object({
  locale: z.enum(['fr', 'en']).default('fr'),
  org_name: z.string().trim().min(2).max(200),
  first_name: z.string().trim().min(2).max(120),
  last_name: z.string().trim().min(2).max(120),
  contact_email: z.string().trim().toLowerCase().email().max(180),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type PreProgrammeQuestionInput = z.input<typeof questionSchema>;
export type PreProgrammeQuestionResult =
  | { ok: true; prospect_id: string }
  | { ok: false; error: string };

export async function submitPreProgrammeQuestionAction(
  input: PreProgrammeQuestionInput,
): Promise<PreProgrammeQuestionResult> {
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' };
  }
  const data = parsed.data;

  try {
    const company = await findOrCreateCompanyForLanding({
      name: data.org_name,
      website: null,
      contactEmail: data.contact_email,
    });
    const contact = await findOrCreateContactForLanding({
      email: data.contact_email,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: null,
      companyId: company.id,
      language: data.locale === 'en' ? 'EN' : 'FR',
    });

    const seasonId = await getActiveSeasonId();
    const supabase = getSupabaseServiceClient();
    const notes = data.message
      ? `[Question pré-programme]\n\n${data.message}`
      : '[Question pré-programme]';
    const { data: prospect, error } = await supabase
      .from('prospects')
      .insert({
        season_id: seasonId,
        company_id: company.id,
        primary_contact_id: contact.id,
        status: 'lead',
        source: 'landing_form',
        source_detail: 'preprogramme_drawer',
        notes,
        is_test: false,
      })
      .select('id')
      .single();
    if (error || !prospect) {
      console.error('%s prospect-insert-failed msg=%s', LOG_PREFIX, error?.message);
      return { ok: false, error: 'Impossible d’enregistrer votre question, réessayez.' };
    }

    // Notification admin (best-effort).
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'philippe@mediadays.solutions';
      const fullName = `${data.first_name} ${data.last_name}`.trim();
      const lines = [
        `Question via le pré-programme.`,
        `Société : ${data.org_name}`,
        `Contact : ${fullName} — ${data.contact_email}`,
        data.message ? `Message : ${data.message}` : null,
      ].filter(Boolean) as string[];
      await sendTransactionalEmailViaResend({
        to: adminEmail,
        subject: `❓ Question pré-programme — ${data.org_name}`,
        html: `<p>${lines.map((l) => l.replace(/</g, '&lt;')).join('<br/>')}</p><p><a href="${appUrl}/admin/prospects/${prospect.id}">Voir la fiche prospect</a></p>`,
        text: `${lines.join('\n')}\n\n${appUrl}/admin/prospects/${prospect.id}`,
        tags: [{ name: 'category', value: 'preprogramme_question' }],
      });
    } catch (err) {
      console.warn(
        '%s admin-email-failed msg=%s',
        LOG_PREFIX,
        err instanceof Error ? err.message : String(err),
      );
    }

    return { ok: true, prospect_id: prospect.id };
  } catch (err) {
    console.error('%s failed msg=%s', LOG_PREFIX, err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'Une erreur est survenue, réessayez plus tard.' };
  }
}
