/**
 * P12.x.EmailIntegration — timeline emails sur la fiche prospect. Liste les
 * emails liés (email_links.prospect_id) + bouton "Nouveau message" prérempli
 * (destinataire = contact, variables template injectées). Server Component.
 */

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import {
  listEmailsForProspect,
  listAccountsForUser,
  listEmailTemplates,
} from '@/lib/admin/emails/queries';
import { ComposerLauncher } from '../../../emails/_components/ComposerLauncher';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function ProspectEmailsSection({
  prospectId,
  profileId,
  contactEmail,
  contactFirstName,
  companyName,
  amount,
}: {
  prospectId: string;
  profileId: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  companyName: string | null;
  amount: number | null;
}) {
  const [emails, accounts, templates] = await Promise.all([
    listEmailsForProspect(prospectId),
    listAccountsForUser(profileId),
    listEmailTemplates(),
  ]);

  const vars: Record<string, string> = {
    'contact.first_name': contactFirstName ?? '',
    'company.name': companyName ?? '',
    'prospect.amount': amount != null ? `${amount} €` : '',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">📧 Emails</h2>
        {accounts.length > 0 && (
          <ComposerLauncher
            accounts={accounts}
            templates={templates}
            label="Nouveau message"
            variant="outline"
            prefill={{
              to: contactEmail ?? '',
              prospectId,
              vars,
            }}
          />
        )}
      </div>

      {emails.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun email lié à ce prospect.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {emails.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/emails/${e.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
              >
                {e.direction === 'outbound' ? (
                  <ArrowUpRight className="size-4 shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <ArrowDownLeft className="text-md-blue size-4 shrink-0" aria-hidden />
                )}
                <span className={`min-w-0 flex-1 truncate ${e.is_read ? '' : 'font-semibold'}`}>
                  {e.subject || '(sans sujet)'}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{fmtDate(e.received_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
