import Link from 'next/link';
import { Search, Inbox, MessagesSquare, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listVisitorMessagesAction } from '@/lib/visitor-messages/actions';
import type { VisitorMessageStatus } from '@/lib/visitor-messages/types';
import { listMyConversationsAction } from '@/lib/internal-messaging/actions';
import { cn } from '@/lib/utils';
import { MessagesTabs } from './_components/MessagesTabs';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS: Array<{ value: VisitorMessageStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'new', label: 'Nouveaux' },
  { value: 'read', label: 'Lus' },
  { value: 'replied', label: 'Répondus' },
  { value: 'archived', label: 'Archivés' },
];

const STATUS_BADGE: Record<VisitorMessageStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  read: 'bg-slate-100 text-slate-700',
  replied: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-zinc-100 text-zinc-600',
};

const STATUS_LABEL: Record<VisitorMessageStatus, string> = {
  new: '🔵 Nouveau',
  read: '✅ Lu',
  replied: '💬 Répondu',
  archived: '🗄️ Archivé',
};

type SearchParams = Promise<{ status?: string; q?: string; page?: string; tab?: string }>;

export default async function MessagesListPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminProfile();
  const params = await searchParams;
  const tab = params.tab === 'interne' ? 'interne' : 'visiteurs';

  if (tab === 'interne') {
    return <InternalConversationsView />;
  }

  const status =
    params.status && STATUS_OPTIONS.some((o) => o.value === params.status)
      ? (params.status as VisitorMessageStatus | 'all')
      : 'all';
  const search = params.q?.trim() ?? '';
  const page = Math.max(1, Number(params.page ?? '1'));

  const { rows, total, unread } = await listVisitorMessagesAction({
    status,
    search: search || undefined,
    page,
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          💬 Messages visiteurs
          <span className="text-md-text-muted ml-2 text-base font-medium">· {total}</span>
        </h1>
        <p className="text-md-text-muted text-sm">
          {unread > 0 ? (
            <span className="text-md-magenta font-semibold">{unread} non-lu(s)</span>
          ) : (
            'Tous les messages traités.'
          )}
        </p>
      </header>

      <MessagesTabs current="visiteurs" />

      <form className="border-md-border bg-card flex flex-wrap items-end gap-3 rounded-xl border p-4 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={opt.value === 'all' ? '/admin/messages' : `/admin/messages?status=${opt.value}`}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                status === opt.value
                  ? 'bg-md-magenta border-md-magenta text-white'
                  : 'border-md-border text-md-text hover:bg-muted',
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-1 items-center gap-2">
          <Search className="text-md-text-muted size-4" aria-hidden />
          <Input
            name="q"
            placeholder="Rechercher (nom, email, message)..."
            defaultValue={search}
            className="max-w-md"
          />
          {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="border-md-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
          <Inbox className="text-md-text-muted size-8" aria-hidden />
          <p className="text-md-text-muted text-sm">Aucun message dans cette vue.</p>
        </div>
      ) : (
        <div className="border-md-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">Visiteur</th>
                <th className="px-3 py-2 text-left">Société</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Message</th>
                <th className="px-3 py-2 text-left">Reçu le</th>
                <th className="px-3 py-2 text-left">CRM</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-md-border hover:bg-muted/30 border-t transition">
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold',
                        STATUS_BADGE[m.status],
                      )}
                    >
                      {STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    {[m.visitor_first_name, m.visitor_last_name].filter(Boolean).join(' ') ||
                      m.visitor_last_name}
                  </td>
                  <td className="text-md-text px-3 py-2.5 text-xs">
                    {m.visitor_company ?? <span className="text-md-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.visitor_email}</td>
                  <td className="text-md-text-muted max-w-md truncate px-3 py-2.5">
                    {m.message.slice(0, 80)}
                    {m.message.length > 80 ? '…' : ''}
                  </td>
                  <td className="text-md-text-muted px-3 py-2.5 text-xs">
                    {new Date(m.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2.5">
                    {m.prospect_id ? (
                      <Link
                        href={`/admin/prospects/${m.prospect_id}`}
                        className="text-md-blue text-xs hover:underline"
                      >
                        {m.prospect_company_name ?? 'Lead'}
                      </Link>
                    ) : (
                      <span className="text-md-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/messages/${m.id}`}
                      className="text-md-magenta text-xs font-semibold hover:underline"
                    >
                      Voir / Répondre →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 ? (
        <p className="text-md-text-muted text-xs">
          {total} messages au total — pagination à venir si besoin.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View "Interne" : conversations staff/exposants (P9.2)
// ---------------------------------------------------------------------------

async function InternalConversationsView() {
  const conversations = await listMyConversationsAction();
  const unread = conversations.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          💬 Messagerie interne
          <span className="text-md-text-muted ml-2 text-base font-medium">
            · {conversations.length}
          </span>
        </h1>
        <p className="text-md-text-muted text-sm">
          {unread > 0 ? (
            <span className="text-md-magenta font-semibold">
              {unread} conversation(s) avec messages non-lus
            </span>
          ) : (
            'Tous les échanges sont à jour.'
          )}
        </p>
      </header>

      <MessagesTabs current="interne" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-md-text-muted text-xs">
          Conversations avec vos collègues (DM) + conversations support exposants (inbox partagée).
        </p>
        <Link
          href="/admin/messages/conversations/new"
          className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold text-white shadow-sm transition"
        >
          <MessagesSquare className="size-4" aria-hidden />+ Nouvelle conversation
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="border-md-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
          <Inbox className="text-md-text-muted size-8" aria-hidden />
          <p className="text-md-text-muted text-sm">Aucune conversation pour l&apos;instant.</p>
        </div>
      ) : (
        <ul className="border-md-border bg-card divide-md-border divide-y rounded-xl border shadow-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/messages/conversations/${c.id}`}
                className="hover:bg-muted/40 flex flex-wrap items-start gap-3 px-4 py-3 transition"
              >
                <div className="flex shrink-0 items-center gap-2">
                  {c.type === 'staff_dm' ? (
                    <Users className="text-md-blue size-4" aria-hidden />
                  ) : (
                    <MessagesSquare className="text-md-magenta size-4" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      c.type === 'staff_dm'
                        ? 'bg-md-blue/10 text-md-blue'
                        : c.type === 'staff_broadcast'
                          ? 'bg-md-warning/15 text-md-warning'
                          : 'bg-md-magenta/10 text-md-magenta',
                    )}
                  >
                    {c.type === 'staff_dm'
                      ? 'DM'
                      : c.type === 'staff_broadcast'
                        ? 'Broadcast'
                        : 'Support'}
                  </span>
                  {c.priority === 'high' ? (
                    <span
                      className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-red-700 uppercase"
                      title="Priorite haute"
                    >
                      ⚠ HAUTE
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-md-text truncate">{c.display_title}</strong>
                    {c.unread_count > 0 ? (
                      <span className="bg-md-magenta rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </div>
                  {c.subject ? (
                    <p className="text-md-text-muted truncate text-xs">{c.subject}</p>
                  ) : null}
                  {c.last_message_preview ? (
                    <p className="text-md-text-muted truncate text-xs">
                      <strong>{c.last_message_sender_name ?? '—'} :</strong>{' '}
                      {c.last_message_preview}
                    </p>
                  ) : null}
                </div>
                <div className="text-md-text-muted shrink-0 text-xs">
                  {new Date(c.last_message_at).toLocaleString('fr-FR')}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
