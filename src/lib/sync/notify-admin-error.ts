/**
 * Helper pour notifier l'admin via email Resend apres l'echec final des
 * 3 retries d'une sync (Sellsy, Stripe, Brevo, VIES).
 *
 * Utilise depuis le `onFinalError` de withExponentialRetry. Best-effort :
 * si l'email lui-meme echoue, on log juste — pas de cascade d'erreur.
 *
 * Logs structures (prefix [sync/notify-admin-error]).
 */

import { sendAdminNotification } from '@/lib/resend/admin-notifier';
import { renderAdminSyncErrorEmail } from '@/lib/resend/templates/admin-notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

const LOG_PREFIX = '[sync/notify-admin-error]';

export type SyncProvider = 'sellsy' | 'stripe' | 'brevo' | 'vies';

export async function notifyAdminSyncError(
  prospectId: string,
  provider: SyncProvider,
  error: Error,
  context?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('prospects')
      .select('company:companies!inner(name)')
      .eq('id', prospectId)
      .maybeSingle();

    const company = pickFirst(data?.company);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const prospectUrl = `${baseUrl}/admin/prospects/${prospectId}`;

    const tpl = renderAdminSyncErrorEmail({
      prospectUrl,
      companyName: company?.name ?? '(société inconnue)',
      provider,
      errorMessage: error.message,
      context,
    });

    await sendAdminNotification('admin_sync_error', tpl);
    console.log('%s sent prospect=%s provider=%s', LOG_PREFIX, prospectId, provider);
  } catch (err) {
    console.error(
      '%s notify-failed prospect=%s provider=%s msg=%s',
      LOG_PREFIX,
      prospectId,
      provider,
      err instanceof Error ? err.message : String(err),
    );
  }
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
