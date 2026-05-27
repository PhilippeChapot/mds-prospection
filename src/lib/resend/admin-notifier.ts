/**
 * Helper centralise pour les notifications admin.
 *
 * Lit app_settings.admin_notification_emails (jsonb array de strings,
 * seede par migration 0022 avec ["philippe@mediadays.solutions"]) et
 * envoie l'email a chaque destinataire via Resend.
 *
 * Garde-fou : si la liste des destinataires est vide ou si app_settings
 * est introuvable, fallback sur philippe.chapot@gmail.com (eviter
 * silent-fail des alertes critiques).
 *
 * Usage :
 *   import { sendAdminNotification } from '@/lib/resend/admin-notifier';
 *   import { renderAdminSyncErrorEmail } from './templates/admin-notifications';
 *
 *   const tpl = renderAdminSyncErrorEmail({ ... });
 *   await sendAdminNotification('admin_sync_error', tpl);
 *
 * Logs structures (prefix [resend/admin-notifier]).
 */

import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[resend/admin-notifier]';
const FALLBACK_RECIPIENT = 'philippe.chapot@gmail.com';

export type AdminNotificationCategory =
  | 'admin_signup_converti'
  | 'admin_acompte_paye'
  | 'admin_concierge_paye'
  | 'admin_paymentadd'
  | 'admin_acompte_echec'
  | 'admin_signature_finale'
  | 'admin_sync_error'
  | 'admin_supplementary_received'
  | 'admin_institutionnel_ecole_request'
  | 'admin_chat_lead';

export interface AdminNotificationTemplateInput {
  subject: string;
  html: string;
  text: string;
}

export interface AdminNotificationResult {
  recipients: string[];
  delivered: number;
  failed: number;
}

export async function sendAdminNotification(
  category: AdminNotificationCategory,
  template: AdminNotificationTemplateInput,
): Promise<AdminNotificationResult> {
  const recipients = await loadAdminRecipients();
  if (recipients.length === 0) {
    console.warn('%s no-recipients category=%s — no notification sent', LOG_PREFIX, category);
    return { recipients: [], delivered: 0, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;

  for (const to of recipients) {
    try {
      await sendTransactionalEmailViaResend({
        to,
        toName: 'Admin MDS',
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: 'category', value: category }],
      });
      delivered++;
    } catch (err) {
      failed++;
      console.error(
        '%s failed to=%s category=%s msg=%s',
        LOG_PREFIX,
        to,
        category,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    '%s sent category=%s delivered=%d failed=%d total=%d',
    LOG_PREFIX,
    category,
    delivered,
    failed,
    recipients.length,
  );

  return { recipients, delivered, failed };
}

async function loadAdminRecipients(): Promise<string[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_notification_emails')
      .maybeSingle();

    const value = data?.value;
    if (Array.isArray(value)) {
      const emails = value.filter((v): v is string => typeof v === 'string' && v.includes('@'));
      if (emails.length > 0) return emails;
    }

    console.warn('%s admin_notification_emails missing/empty — fallback', LOG_PREFIX);
    return [FALLBACK_RECIPIENT];
  } catch (err) {
    console.error(
      '%s settings-load-failed msg=%s — fallback',
      LOG_PREFIX,
      err instanceof Error ? err.message : String(err),
    );
    return [FALLBACK_RECIPIENT];
  }
}
