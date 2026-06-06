import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, ExternalLink } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getVisitorMessageAction } from '@/lib/visitor-messages/actions';
import { ReplyForm } from './ReplyForm';
import { StatusActions } from './StatusActions';
import { formatParisDateTime } from '@/lib/format/dates';

export const metadata = { title: 'Message visiteur' };
export const dynamic = 'force-dynamic';

export default async function VisitorMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminProfile();
  const { id } = await params;
  const result = await getVisitorMessageAction({ id });
  if (!result) notFound();
  const { message, replies } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/messages"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à l&apos;inbox
      </Link>

      <header className="space-y-2">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Message de{' '}
          {[message.visitor_first_name, message.visitor_last_name].filter(Boolean).join(' ') ||
            message.visitor_last_name}
        </h1>
        {message.visitor_company ? (
          <p className="text-md-text text-sm">
            <strong>{message.visitor_company}</strong>
            {message.visitor_company_url ? (
              <>
                {' · '}
                <a
                  className="text-md-blue hover:underline"
                  href={message.visitor_company_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {message.visitor_company_url}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <p className="text-md-text-muted text-sm">
          <a className="text-md-blue hover:underline" href={`mailto:${message.visitor_email}`}>
            {message.visitor_email}
          </a>
          {message.visitor_phone ? (
            <>
              {' · '}
              <a className="text-md-blue hover:underline" href={`tel:${message.visitor_phone}`}>
                {message.visitor_phone}
              </a>
            </>
          ) : null}
          {' · '}
          <span className="font-mono">{formatParisDateTime(message.created_at)}</span>
        </p>
      </header>

      <StatusActions messageId={message.id} status={message.status} />

      {/* Message original */}
      <section className="border-md-border bg-card space-y-2 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          Message reçu
        </h2>
        <div className="text-md-text bg-md-bg-soft rounded-md px-4 py-3 text-sm whitespace-pre-wrap">
          {message.message}
        </div>
        {message.page_url ? (
          <p className="text-md-text-muted text-xs">
            Page d&apos;origine :{' '}
            <a
              className="text-md-blue hover:underline"
              href={message.page_url}
              target="_blank"
              rel="noreferrer"
            >
              {message.page_url}
            </a>
          </p>
        ) : null}
        {message.prospect_id ? (
          <p className="text-md-text-muted text-xs">
            Lead CRM :{' '}
            <Link
              href={`/admin/prospects/${message.prospect_id}`}
              className="text-md-blue inline-flex items-center gap-1 hover:underline"
            >
              {message.prospect_company_name ?? 'Voir la fiche prospect'}
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          </p>
        ) : null}
      </section>

      {/* Thread reponses */}
      {replies.length > 0 ? (
        <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            Réponses ({replies.length})
          </h2>
          <ul className="space-y-3">
            {replies.map((r) => (
              <li
                key={r.id}
                className="border-md-border border-l-md-magenta bg-md-bg-soft space-y-1 rounded-md border-l-4 p-3"
              >
                <p className="text-md-text-muted text-xs">
                  <strong className="text-md-text">
                    {r.sender_full_name ?? r.sender_email ?? 'Staff'}
                  </strong>{' '}
                  · {new Date(r.created_at).toLocaleString('fr-FR')}
                  {r.email_sent_at ? (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-md-success inline-flex items-center gap-0.5">
                        <Mail className="size-3" aria-hidden />
                        envoyé
                      </span>
                    </>
                  ) : (
                    <>
                      {' '}
                      · <span className="text-md-warning">email non envoyé</span>
                    </>
                  )}
                </p>
                <div className="text-md-text text-sm whitespace-pre-wrap">{r.reply_text}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Formulaire de reponse */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          Répondre par email
        </h2>
        <p className="text-md-text-muted text-xs">
          L&apos;email sera envoyé à <strong>{message.visitor_email}</strong> avec un reply-to
          philippe@mediadays.solutions et la citation du message original.
        </p>
        <ReplyForm messageId={message.id} visitorEmail={message.visitor_email} />
      </section>
    </div>
  );
}
