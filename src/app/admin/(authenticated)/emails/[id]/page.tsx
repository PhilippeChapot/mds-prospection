/**
 * P12.x.EmailIntegration — détail email (preview). Body rendu dans un iframe
 * sandbox (XSS isolé, PII tiers). Attachments signed URLs, liens prospect/
 * contact/company, bouton Répondre (threading In-Reply-To/References).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { type SupabaseClient } from '@supabase/supabase-js';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  getEmailDetail,
  listAccountsForUser,
  listEmailTemplates,
} from '@/lib/admin/emails/queries';
import { EmailFlagActions } from '../_components/EmailFlagActions';
import { ComposerLauncher } from '../_components/ComposerLauncher';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmailDetailPage({ params }: PageProps) {
  const profile = await requireAdminProfile();
  if (profile.role === 'sales') notFound();
  const { id } = await params;

  const email = await getEmailDetail(id);
  if (!email) notFound();

  // Marque lu (best-effort) à l'ouverture.
  if (!email.is_read) {
    const db = getSupabaseServiceClient() as unknown as SupabaseClient;
    await db
      .from('emails')
      .update({ is_read: true } as never)
      .eq('id', id);
  }

  const accounts = await listAccountsForUser(profile.id);
  const templates = await listEmailTemplates();

  const replyTo =
    email.direction === 'inbound' ? (email.from_email ?? '') : (email.to_emails[0] ?? '');
  const replySubject = email.subject?.startsWith('Re:')
    ? email.subject
    : `Re: ${email.subject ?? ''}`;
  const replyReferences = [email.email_references, email.message_id].filter(Boolean).join(' ');

  return (
    <div className="space-y-5 p-6">
      <Link
        href="/admin/emails"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Retour à l’inbox
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold break-words">
              {email.subject || '(sans sujet)'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium">{email.from_name ?? email.from_email}</span>
              {email.from_email && email.from_name ? ` <${email.from_email}>` : ''}
            </p>
            <p className="text-xs text-slate-400">
              À : {email.to_emails.join(', ') || '—'}
              {email.cc_emails.length > 0 ? ` · CC : ${email.cc_emails.join(', ')}` : ''}
            </p>
            <p className="text-xs text-slate-400">
              {email.received_at ? new Date(email.received_at).toLocaleString('fr-FR') : '—'} ·{' '}
              {email.direction === 'outbound' ? 'Envoyé' : 'Reçu'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ComposerLauncher
              accounts={accounts}
              templates={templates}
              isReply
              label="Répondre"
              variant="default"
              prefill={{
                to: replyTo,
                subject: replySubject,
                inReplyTo: email.message_id,
                references: replyReferences,
              }}
            />
          </div>
        </div>

        {/* Liens prospect/contact/company */}
        {email.links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {email.links.map((l, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {l.prospect_id && (
                  <Link
                    href={`/admin/prospects/${l.prospect_id}`}
                    className="bg-md-blue/10 text-md-blue rounded-full px-3 py-1 text-xs font-medium hover:underline"
                  >
                    {l.company_name ?? 'Prospect'} →
                  </Link>
                )}
                {!l.prospect_id && l.company_id && (
                  <Link
                    href={`/admin/companies/${l.company_id}`}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:underline"
                  >
                    {l.company_name ?? 'Société'}
                  </Link>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <EmailFlagActions
            emailId={email.id}
            isStarred={email.is_starred}
            isArchived={email.is_archived}
          />
        </div>

        {/* Corps — iframe sandbox (scripts neutralisés). */}
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {email.body_html ? (
            <iframe
              title="Contenu de l'email"
              sandbox=""
              srcDoc={email.body_html}
              className="h-[480px] w-full bg-white"
            />
          ) : (
            <pre className="max-h-[480px] overflow-auto p-4 text-sm whitespace-pre-wrap">
              {email.body_text || '(vide)'}
            </pre>
          )}
        </div>

        {/* Attachments */}
        {email.attachments.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
              Pièces jointes
            </p>
            <ul className="flex flex-col gap-1.5">
              {email.attachments.map((a) => (
                <li key={a.id}>
                  {a.signedUrl ? (
                    <a
                      href={a.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-md-blue inline-flex items-center gap-1.5 text-sm hover:underline"
                    >
                      <Paperclip className="size-3.5" aria-hidden /> {a.filename}
                      {a.size_bytes ? ` (${Math.round(a.size_bytes / 1024)} Ko)` : ''}
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">{a.filename} (indisponible)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
