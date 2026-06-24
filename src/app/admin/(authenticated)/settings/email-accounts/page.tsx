/**
 * P12.x.EmailIntegration — réglages des comptes email (RBAC admin+).
 * Liste + statut (last_synced_at / last_error) + test + resync + ajout.
 */

import { notFound } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listAccountsForUser } from '@/lib/admin/emails/queries';
import { EmailAccountControls } from './_components/EmailAccountControls';
import { AddAccountForm } from './_components/AddAccountForm';

export const dynamic = 'force-dynamic';

export default async function EmailAccountsSettingsPage() {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') notFound();
  const accounts = await listAccountsForUser(profile.id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">📧 Comptes email</h1>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun compte. Ajoutez-en un puis renseignez les mots de passe dans Vercel.
        </p>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {a.display_name ? `${a.display_name} ` : ''}
                    <span className="text-slate-500">&lt;{a.email}&gt;</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    IMAP {a.imap_host}:{a.imap_port} · SMTP {a.smtp_host}:{a.smtp_port} · clé{' '}
                    <code>{a.env_var_key}</code>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.is_active ? '🟢 Actif' : '⚪ Inactif'} · Dernière sync :{' '}
                    {a.last_synced_at
                      ? new Date(a.last_synced_at).toLocaleString('fr-FR')
                      : 'jamais'}
                  </p>
                  {a.last_error && (
                    <p className="text-md-magenta mt-1 text-xs">⚠️ {a.last_error}</p>
                  )}
                </div>
                <EmailAccountControls accountId={a.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      <AddAccountForm />
    </div>
  );
}
