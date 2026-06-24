/**
 * P12.x.EmailIntegration — inbox unifiée admin (RBAC admin+, ADMIN_PLUS).
 * Server Component, pagination 50, filtres URL. Snippet only (PII : body sur
 * la page détail uniquement).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Paperclip, Star } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import {
  listEmails,
  listAccountsForUser,
  listEmailTemplates,
  type EmailFilter,
} from '@/lib/admin/emails/queries';
import { ComposerLauncher } from './_components/ComposerLauncher';

export const dynamic = 'force-dynamic';

const FILTERS: Array<{ key: EmailFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'unread', label: 'Non lus' },
  { key: 'starred', label: 'Étoilés' },
  { key: 'sent', label: 'Envoyés' },
  { key: 'archived', label: 'Archivés' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PageProps {
  searchParams: Promise<{ filter?: string; account?: string; q?: string; page?: string }>;
}

export default async function EmailsInboxPage({ searchParams }: PageProps) {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') notFound();

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? 'all') as EmailFilter;
  const accountId = sp.account ?? null;
  const q = sp.q ?? '';
  const page = Math.max(1, Number(sp.page) || 1);

  const accounts = await listAccountsForUser(profile.id);
  const templates = await listEmailTemplates();
  const { rows, total, perPage } = await listEmails({
    userId: profile.id,
    filter,
    accountId,
    q,
    page,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (filter !== 'all') p.set('filter', filter);
    if (accountId) p.set('account', accountId);
    if (q) p.set('q', q);
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">📧 Emails · {total}</h1>
        <ComposerLauncher accounts={accounts} templates={templates} />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Aucun compte email configuré.{' '}
          <Link href="/admin/settings/email-accounts" className="text-md-blue underline">
            Configurer un compte
          </Link>
        </div>
      ) : (
        <>
          {/* Filtres */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/admin/emails${qs({ filter: f.key === 'all' ? '' : f.key, page: '' })}`}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  filter === f.key
                    ? 'border-transparent bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {/* Recherche */}
          <form action="/admin/emails" method="get" className="flex gap-2">
            {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
            {accountId && <input type="hidden" name="account" value={accountId} />}
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Rechercher (sujet, expéditeur, aperçu)…"
              className="focus:border-md-blue w-full max-w-md rounded-lg border-2 border-slate-200 px-4 py-2 text-sm focus:outline-none"
            />
          </form>

          {/* Liste */}
          {rows.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Aucun email pour ce filtre.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">De / À</th>
                    <th className="px-4 py-2">Sujet</th>
                    <th className="hidden px-4 py-2 md:table-cell">Aperçu</th>
                    <th className="px-4 py-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr
                      key={e.id}
                      className={e.is_read ? 'bg-white' : 'bg-blue-50/40 font-semibold'}
                    >
                      <td className="max-w-[200px] truncate px-4 py-2.5">
                        <Link href={`/admin/emails/${e.id}`} className="hover:underline">
                          {e.is_starred && (
                            <Star
                              className="mr-1 inline size-3.5 fill-amber-400 text-amber-400"
                              aria-hidden
                            />
                          )}
                          {e.direction === 'outbound'
                            ? `À ${e.to_emails[0] ?? '—'}`
                            : (e.from_name ?? e.from_email ?? '—')}
                        </Link>
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-2.5">
                        <Link href={`/admin/emails/${e.id}`} className="hover:underline">
                          {e.has_attachments && (
                            <Paperclip
                              className="mr-1 inline size-3.5 text-slate-400"
                              aria-hidden
                            />
                          )}
                          {e.subject || '(sans sujet)'}
                        </Link>
                      </td>
                      <td className="hidden max-w-[320px] truncate px-4 py-2.5 font-normal text-slate-500 md:table-cell">
                        {e.snippet}
                      </td>
                      <td className="px-4 py-2.5 text-right font-normal whitespace-nowrap text-slate-500">
                        {fmtDate(e.received_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              {page > 1 && (
                <Link
                  href={`/admin/emails${qs({ page: String(page - 1) })}`}
                  className="text-md-blue hover:underline"
                >
                  ← Précédent
                </Link>
              )}
              <span className="text-slate-500">
                Page {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/admin/emails${qs({ page: String(page + 1) })}`}
                  className="text-md-blue hover:underline"
                >
                  Suivant →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
