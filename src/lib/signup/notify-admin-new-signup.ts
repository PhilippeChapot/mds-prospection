/**
 * Notif admin a chaque nouvelle entree public_signup_attempts (etape 1,
 * meme si le signup reste incomplet — cf. brief SignupNotifs+Badge).
 *
 * Best-effort : un echec ici ne doit jamais faire echouer initSignup.
 */

import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { renderAdminSignupRecuEmail } from '@/lib/resend/templates/admin-notifications';

const LOG_PREFIX = '[signup/notify-admin-new-signup]';

export interface NewSignupNotifInput {
  id: string;
  email: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  category: string;
  /** null tant que step2 n'a pas ete soumis -> etape 1/2. */
  step2SubmittedAt: string | null;
  language: 'FR' | 'EN';
  createdAt: string;
  baseUrl?: string;
}

export async function notifyAdminNewSignup(input: NewSignupNotifInput): Promise<void> {
  try {
    const baseUrl =
      input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
    const contactName = [input.firstName, input.lastName].filter(Boolean).join(' ');

    const template = renderAdminSignupRecuEmail({
      signupUrl: `${baseUrl}/admin/signups/${input.id}`,
      email: input.email,
      companyName: input.companyName,
      contactName,
      category: input.category,
      stepCompleted: input.step2SubmittedAt ? 2 : 1,
      language: input.language,
      createdAtFormatted: new Date(input.createdAt).toLocaleString('fr-FR'),
    });

    await sendAdminNotification('admin_signup_recu', template);
  } catch (err) {
    console.error(
      '%s failed signup_id=%s msg=%s',
      LOG_PREFIX,
      input.id,
      err instanceof Error ? err.message : String(err),
    );
  }
}
