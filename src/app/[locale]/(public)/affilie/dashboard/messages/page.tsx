/**
 * P7.x.AffiliePitchsAndChat — page liste messages affilie.
 *
 * Liste les conv staff_affilie de l affilie connecte (filtre strict
 * via metadata.affiliate_id cote server action).
 */

import Link from 'next/link';
import { Inbox, MessagesSquare } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale as IntlLocale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { listMyConversationsForAffilieAction } from '@/lib/affilie/messaging-actions';
import { formatParisDateTime } from '@/lib/format/dates';
import { NewAffilieConversationButton } from './NewAffilieConversationButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: IntlLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'en' ? 'Messages · Affiliate MDS 2026' : 'Messages · Affilié MDS 2026',
  };
}

interface PageProps {
  params: Promise<{ locale: IntlLocale }>;
}

export default async function AffilieMessagesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const localeSafe: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  await requireAffilieSession(localeSafe);

  const conversations = await listMyConversationsForAffilieAction(localeSafe);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          💬 Messages
        </h1>
        <p className="text-md-text-muted text-sm">
          {localeSafe === 'en'
            ? 'Your asynchronous conversations with the MediaDays Solutions team. Email notifications on every reply.'
            : "Vos échanges asynchrones avec l'équipe MediaDays Solutions. Notification email à chaque réponse."}
        </p>
      </header>

      <div className="flex justify-end">
        <NewAffilieConversationButton locale={localeSafe} />
      </div>

      {conversations.length === 0 ? (
        <div className="border-md-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
          <Inbox className="text-md-text-muted size-8" aria-hidden />
          <p className="text-md-text-muted text-sm">
            {localeSafe === 'en'
              ? 'No conversations yet. Click "Contact the MDS team" to start.'
              : "Aucune conversation pour l'instant. Cliquez sur « Contacter l'équipe MDS » pour démarrer."}
          </p>
        </div>
      ) : (
        <ul className="border-md-border bg-card divide-md-border divide-y rounded-xl border shadow-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${localeSafe}/affilie/dashboard/messages/${c.id}`}
                className="hover:bg-muted/40 flex flex-wrap items-start gap-3 px-4 py-3 transition"
              >
                <MessagesSquare className="text-md-magenta size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-md-text truncate">
                      {c.subject ?? (localeSafe === 'en' ? 'Conversation' : 'Conversation')}
                    </strong>
                    {c.unread_count > 0 ? (
                      <span className="bg-md-magenta rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {c.unread_count}
                      </span>
                    ) : null}
                  </div>
                  {c.last_message_preview ? (
                    <p className="text-md-text-muted truncate text-xs">
                      <strong>{c.last_message_sender_name ?? '—'} :</strong>{' '}
                      {c.last_message_preview}
                    </p>
                  ) : null}
                </div>
                <div className="text-md-text-muted shrink-0 text-xs">
                  {formatParisDateTime(c.last_message_at, localeSafe)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
