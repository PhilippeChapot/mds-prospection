/**
 * P15.2 — alerte "Big Company".
 *
 * Si l'enrichissement Apollo révèle une société de plus de
 * BIG_CO_EMPLOYEE_THRESHOLD employés, on marque le visiteur `is_big_company`
 * et on prévient les super_admin par email (Resend) — opportunité partenariat.
 *
 * Seuil arbitraire (V1 = 1000). Pourra passer en app_settings plus tard.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendTransactionalEmailViaResend } from '@/lib/resend/client';
import type { Database } from '@/lib/supabase/database.types';
import { BIG_CO_EMPLOYEE_THRESHOLD } from '@/lib/visitors/constants';

export { BIG_CO_EMPLOYEE_THRESHOLD };

type ServiceClient = SupabaseClient<Database>;

export type BigCoCompany = {
  id: string;
  name: string;
  employee_count: number | null;
  industry: string | null;
};

/** Renvoie true si la société dépasse le seuil Big Co. */
export function isBigCompany(employeeCount: number | null | undefined): boolean {
  return (employeeCount ?? 0) > BIG_CO_EMPLOYEE_THRESHOLD;
}

/**
 * Marque le visiteur is_big_company + notifie les super_admin.
 * Idempotent côté flag. Les échecs d'email ne propagent pas (best-effort).
 */
export async function notifyBigCoVisitor(
  visitorId: string,
  company: BigCoCompany,
  client?: ServiceClient,
): Promise<void> {
  const supabase = client ?? getSupabaseServiceClient();

  // Flag sur le visiteur.
  await supabase
    .from('visitors')
    .update({ is_big_company: true, updated_at: new Date().toISOString() })
    .eq('id', visitorId);

  // Super_admins destinataires.
  const { data: superAdmins } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('role', 'super_admin');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mediadays.solutions';
  const ficheUrl = `${appUrl}/admin/visitors/${visitorId}`;
  const empLabel = company.employee_count ? `${company.employee_count}+` : '1000+';

  for (const sa of superAdmins ?? []) {
    if (!sa.email) continue;
    const firstName = sa.full_name?.trim()?.split(/\s+/)[0] ?? '';
    try {
      await sendTransactionalEmailViaResend({
        to: sa.email,
        toName: sa.full_name ?? undefined,
        subject: `🐳 Visiteur Big Co : ${company.name} (${empLabel} employés)`,
        html: `
          <p>Bonjour ${firstName},</p>
          <p>Un visiteur d'une <strong>grande entreprise</strong> vient d'être ajouté à MDS :</p>
          <ul>
            <li><strong>Société :</strong> ${company.name}</li>
            <li><strong>Employés :</strong> ${empLabel}</li>
            <li><strong>Industrie :</strong> ${company.industry ?? '—'}</li>
          </ul>
          <p>Opportunité partenariat ? <a href="${ficheUrl}">Voir la fiche visiteur</a></p>
        `,
        text:
          `Visiteur Big Co : ${company.name} (${empLabel} employés). ` +
          `Industrie : ${company.industry ?? '—'}. Fiche : ${ficheUrl}`,
        tags: [{ name: 'type', value: 'big_co_alert' }],
      });
    } catch {
      // best-effort : un email raté ne bloque pas la création du visiteur.
    }
  }

  // Audit log (événement système, user_id null).
  await supabase.from('audit_log').insert({
    user_id: null,
    entity_type: 'visitors',
    entity_id: visitorId,
    action: 'update',
    after: {
      kind: 'big_co_alert_sent',
      company_id: company.id,
      employees: company.employee_count,
    },
  });
}
