import Link from 'next/link';
import { MessagesSquare, Inbox } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { listMyConversationsAction } from '@/lib/internal-messaging/actions';
import { NewPartenaireConversationButton } from './NewPartenaireConversationButton';
import { formatParisDateTime } from '@/lib/format/dates';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

/**
 * P9.2 — page messagerie pour l'partenaire connecte.
 *
 * Liste les conversations support de cet partenaire (les seules visibles
 * pour lui via filtrage participant_type='contact' + participant_id =
 * son contact). Bouton "+ Contacter l'equipe MDS" cree une conversation
 * vers staff_pool.
 */
export default async function EspacePartenaireMessagesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const conversations = await listMyConversationsAction({
    as_contact: true,
    locale: locale === 'en' ? 'en' : 'fr',
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          💬 Messages
        </h1>
        <p className="text-md-text-muted text-sm">
          {locale === 'en'
            ? 'Your asynchronous conversations with the MediaDays Solutions team. Email notifications on every reply.'
            : "Vos échanges asynchrones avec l'équipe MediaDays Solutions. Notification email à chaque réponse."}
        </p>
      </header>

      <div className="flex justify-end">
        <NewPartenaireConversationButton locale={locale === 'en' ? 'en' : 'fr'} />
      </div>

      {conversations.length === 0 ? (
        <div className="border-md-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
          <Inbox className="text-md-text-muted size-8" aria-hidden />
          <p className="text-md-text-muted text-sm">
            {locale === 'en' ? 'No conversations yet.' : "Aucune conversation pour l'instant."}
          </p>
        </div>
      ) : (
        <ul className="border-md-border bg-card divide-md-border divide-y rounded-xl border shadow-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${locale}/espace-partenaire/dashboard/messages/${c.id}`}
                className="hover:bg-muted/40 flex flex-wrap items-start gap-3 px-4 py-3 transition"
              >
                <MessagesSquare className="text-md-magenta size-4 shrink-0" aria-hidden />
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
                  {formatParisDateTime(c.last_message_at, locale === 'en' ? 'en' : 'fr')}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
