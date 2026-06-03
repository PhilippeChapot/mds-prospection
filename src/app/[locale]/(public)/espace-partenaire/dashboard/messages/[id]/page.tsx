import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { getConversationAction } from '@/lib/internal-messaging/actions';
import { requireContactSession } from '@/lib/espace-partenaire/session';
import { detectUserProfile } from '@/lib/espace-partenaire/detect-profile';
import { PartenaireConversationReplyForm } from './PartenaireConversationReplyForm';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Conversation' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: Locale; id: string }>;
}

export default async function EspacePartenaireConversationPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const localeSafe = locale === 'en' ? 'en' : 'fr';

  // P8.2-redirect-loop : on utilise requireContactSession + detectUserProfile
  // (qui marche pour tout contact, partenaire ou non) au lieu de
  // loadDashboardData qui exigeait un prospect actif.
  const session = await requireContactSession(localeSafe);
  const profile = await detectUserProfile(session.contactId);
  const myFullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
    : '';

  const result = await getConversationAction({
    conversation_id: id,
    as_contact: true,
    locale: localeSafe,
  });
  if (!result) notFound();
  const { conversation, messages } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/${localeSafe}/espace-partenaire/dashboard/messages`}
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {localeSafe === 'en' ? 'Back to messages' : 'Retour aux messages'}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MessagesSquare className="text-md-magenta size-5" aria-hidden />
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {conversation.display_title}
          </h1>
        </div>
        {conversation.subject ? (
          <p className="text-md-text text-sm">
            <strong>{localeSafe === 'en' ? 'Subject' : 'Sujet'} :</strong> {conversation.subject}
          </p>
        ) : null}
      </header>

      <section className="space-y-2">
        {messages.length === 0 ? (
          <p className="text-md-text-muted text-sm">—</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const isSelf = m.sender_type === 'contact';
              return (
                <li key={m.id} className={cn('flex', isSelf ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm',
                      isSelf
                        ? 'bg-md-magenta rounded-br-sm text-white'
                        : 'bg-md-bg-soft border-md-border text-md-text rounded-bl-sm border',
                    )}
                  >
                    <p
                      className={cn(
                        'text-[11px] font-semibold tracking-wider uppercase opacity-80',
                        isSelf ? 'text-white' : 'text-md-text-muted',
                      )}
                    >
                      {isSelf ? myFullName || m.sender_name : m.sender_name} ·{' '}
                      {new Date(m.created_at).toLocaleString(
                        localeSafe === 'en' ? 'en-GB' : 'fr-FR',
                      )}
                    </p>
                    <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="border-md-border bg-card space-y-2 rounded-xl border p-4 shadow-sm">
        <h2 className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
          {localeSafe === 'en' ? 'Reply' : 'Répondre'}
        </h2>
        <PartenaireConversationReplyForm conversationId={conversation.id} locale={localeSafe} />
      </section>
    </div>
  );
}
