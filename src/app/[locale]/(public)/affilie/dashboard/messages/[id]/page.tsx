/**
 * P7.x.AffiliePitchsAndChat — detail conv affilie.
 *
 * Sécurité : getConversationDetailForAffilieAction vérifie strictement
 * que metadata.affiliate_id = session.affiliateId. Un affilié A ne
 * peut JAMAIS lire les conv d un affilié B (notFound() sinon).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { getConversationDetailForAffilieAction } from '@/lib/affilie/messaging-actions';
import { formatParisDateTime } from '@/lib/format/dates';
import { cn } from '@/lib/utils';
import { AffilieReplyForm } from './AffilieReplyForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation' };

interface PageProps {
  params: Promise<{ locale: Locale; id: string }>;
}

export default async function AffilieConversationPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const localeSafe: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  await requireAffilieSession(localeSafe);

  const result = await getConversationDetailForAffilieAction(id, localeSafe);
  if (!result.ok) notFound();
  const { data: conv } = result;
  if (!conv) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/${localeSafe}/affilie/dashboard/messages`}
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {localeSafe === 'en' ? 'Back to messages' : 'Retour aux messages'}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MessagesSquare className="text-md-magenta size-5" aria-hidden />
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {conv.subject ?? (localeSafe === 'en' ? 'Conversation' : 'Conversation')}
          </h1>
        </div>
      </header>

      <section className="space-y-2">
        {conv.messages.length === 0 ? (
          <p className="text-md-text-muted text-sm">—</p>
        ) : (
          <ul className="space-y-2">
            {conv.messages.map((m) => (
              <li key={m.id} className={cn('flex', m.is_mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm',
                    m.is_mine
                      ? 'bg-md-magenta rounded-br-sm text-white'
                      : 'bg-md-bg-soft border-md-border text-md-text rounded-bl-sm border',
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] font-semibold tracking-wider uppercase opacity-80',
                      m.is_mine ? 'text-white' : 'text-md-text-muted',
                    )}
                  >
                    {m.sender_name} · {formatParisDateTime(m.created_at, localeSafe)}
                  </p>
                  <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-md-border bg-card space-y-2 rounded-xl border p-4 shadow-sm">
        <h2 className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
          {localeSafe === 'en' ? 'Reply' : 'Répondre'}
        </h2>
        <AffilieReplyForm conversationId={conv.id} locale={localeSafe} />
      </section>
    </div>
  );
}
