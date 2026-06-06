import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Users, MessagesSquare } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getConversationAction } from '@/lib/internal-messaging/actions';
import { ConversationReplyForm } from './ConversationReplyForm';
import { cn } from '@/lib/utils';
import { formatParisDateTime } from '@/lib/format/dates';

export const metadata = { title: 'Conversation interne' };
export const dynamic = 'force-dynamic';

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdminProfile();
  const { id } = await params;
  const result = await getConversationAction({ conversation_id: id });
  if (!result) notFound();
  const { conversation, messages } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/messages?tab=interne"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la messagerie interne
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {conversation.type === 'staff_dm' ? (
            <Users className="text-md-blue size-5" aria-hidden />
          ) : (
            <MessagesSquare className="text-md-magenta size-5" aria-hidden />
          )}
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {conversation.display_title}
          </h1>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              conversation.type === 'staff_dm'
                ? 'bg-md-blue/10 text-md-blue'
                : 'bg-md-magenta/10 text-md-magenta',
            )}
          >
            {conversation.type === 'staff_dm' ? 'DM staff' : 'Support'}
          </span>
        </div>
        {conversation.subject ? (
          <p className="text-md-text text-sm">
            <strong>Sujet :</strong> {conversation.subject}
          </p>
        ) : null}
        <p className="text-md-text-muted text-xs">
          Créée le {formatParisDateTime(conversation.created_at)} · {messages.length} message
          {messages.length > 1 ? 's' : ''}
        </p>
      </header>

      <section className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-md-text-muted text-sm">Aucun message.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const isSelf = m.sender_type === 'user' && m.sender_id === me.id;
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
                      {m.sender_name} · {formatParisDateTime(m.created_at)}
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
        <h2 className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">Répondre</h2>
        <ConversationReplyForm conversationId={conversation.id} />
      </section>
    </div>
  );
}
