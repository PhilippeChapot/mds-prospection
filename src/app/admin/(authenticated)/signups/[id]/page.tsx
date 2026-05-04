import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { AuditTimeline, type AuditRow } from '@/components/admin/AuditTimeline';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Step2PayloadView } from './Step2PayloadView';
import { AdminActionsBar } from './AdminActionsBar';
import {
  SIGNUP_STATUS_CLASS,
  SIGNUP_STATUS_LABEL,
  SIGNUP_STATUSES,
  type SignupStatus,
} from '../types';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: 'Inscription' };

export default async function SignupDetailPage({ params }: PageProps) {
  const { id } = await params;
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    redirect('/admin?error=signups_admin_only');
  }

  const supabase = await createSupabaseServerClient();

  const { data: signup, error } = await supabase
    .from('public_signup_attempts')
    .select(
      'id, email, email_domain, email_validation_status, neverbounce_result, contact_first_name, contact_last_name, contact_phone, company_name_input, matched_company_id, is_new_company, category, derived_category, language, marketing_consent, cgv_accepted_at, ai_classification, ip_address, user_agent, referrer, utm_source, utm_medium, utm_campaign, status, doi_token_expires_at, verification_sent_at, verified_at, step2_payload, step2_submitted_at, converted_to_prospect_id, affiliate_input_raw, created_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !signup) {
    notFound();
  }

  const status = (SIGNUP_STATUSES as readonly string[]).includes(signup.status)
    ? (signup.status as SignupStatus)
    : ('awaiting_verification' as SignupStatus);

  const ai = signup.ai_classification as {
    pole_code?: string;
    confidence?: number;
    reasoning?: string;
    model?: string;
  } | null;
  const isPole = ai?.pole_code && (POLE_CODES as readonly string[]).includes(ai.pole_code);

  // Audit log
  const { data: auditData } = await supabase
    .from('audit_log')
    .select('id, action, before, after, created_at, user:users(full_name, email)')
    .eq('entity_type', 'public_signup_attempts')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  const auditRows: AuditRow[] = (auditData ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    before: row.before as Record<string, unknown> | null,
    after: row.after as Record<string, unknown> | null,
    created_at: row.created_at,
    user: pickFirst(row.user),
  }));

  const fullName = [signup.contact_first_name, signup.contact_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const tokenExpired = isTokenExpired(signup.doi_token_expires_at);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/signups"
            className="text-md-text-muted mb-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeft className="size-3" aria-hidden /> Retour à la liste
          </Link>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {fullName || signup.email}
          </h1>
          <p className="text-md-text-muted text-sm break-all">
            {signup.email}
            {signup.company_name_input && ` · ${signup.company_name_input}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
              SIGNUP_STATUS_CLASS[status],
            )}
          >
            <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
            {SIGNUP_STATUS_LABEL[status]}
          </span>
          {signup.converted_to_prospect_id && (
            <Link
              href={`/admin/prospects/${signup.converted_to_prospect_id}`}
              className="text-md-blue inline-flex items-center gap-1 text-xs hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden /> Voir le prospect
            </Link>
          )}
        </div>
      </div>

      {/* Actions admin */}
      <AdminActionsBar
        signupId={signup.id}
        status={status}
        tokenExpired={tokenExpired}
        hasProspect={!!signup.converted_to_prospect_id}
      />

      {/* Section Étape 1 */}
      <SectionCard title="Étape 1 — informations soumises">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Email">
            <span className="break-all">{signup.email}</span>
          </Field>
          <Field label="Société">{signup.company_name_input ?? '—'}</Field>
          <Field label="Pays société">—</Field>
          <Field label="Catégorie déclarée">
            {signup.category === 'exposant'
              ? 'Exposant'
              : signup.category === 'partenaire'
                ? 'Partenaire'
                : '—'}
          </Field>
          <Field label="Catégorie tarifaire (auto)">{signup.derived_category}</Field>
          <Field label="Société match PRS ?">
            {signup.derived_category === 'prs_exhibitor' ? 'Oui (Cas A)' : 'Non (Cas B)'}
          </Field>
          <Field label="Prénom">{signup.contact_first_name ?? '—'}</Field>
          <Field label="Nom">{signup.contact_last_name ?? '—'}</Field>
          <Field label="Téléphone">{signup.contact_phone ?? '—'}</Field>
          <Field label="Référé par" wide>
            {signup.affiliate_input_raw ? (
              <span className="text-md-text">{signup.affiliate_input_raw}</span>
            ) : (
              <span className="text-md-text-muted text-xs">—</span>
            )}
          </Field>
          <Field label="Langue">{signup.language}</Field>
          <Field label="Consentement RGPD">
            <span className="text-md-success">✓ Accepté</span>{' '}
            <span className="text-md-text-muted text-xs">(obligatoire à l&apos;étape 1)</span>
          </Field>
          <Field label="Consentement marketing">
            {signup.marketing_consent ? (
              <span className="text-md-success">✓ Accepté</span>
            ) : (
              <span className="text-md-text-muted">Refusé</span>
            )}
          </Field>
          <Field label="CGV acceptées">
            {signup.cgv_accepted_at ? (
              <span className="text-md-success">{formatTs(signup.cgv_accepted_at)}</span>
            ) : (
              <span className="text-md-text-muted">—</span>
            )}
          </Field>
        </dl>
      </SectionCard>

      {/* Section Vérifications auto */}
      <SectionCard title="Vérifications automatiques">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="NeverBounce">
            <code className="bg-md-bg-soft rounded px-1.5 py-0.5 text-xs">
              {signup.neverbounce_result ?? '—'}
            </code>
          </Field>
          <Field label="Statut email">
            <code className="bg-md-bg-soft rounded px-1.5 py-0.5 text-xs">
              {signup.email_validation_status}
            </code>
          </Field>
          <Field label="Domaine email">{signup.email_domain ?? '—'}</Field>
          <Field label="DOI vérifié à">
            {signup.verified_at ? formatTs(signup.verified_at) : '—'}
          </Field>
          <Field label="DOI envoyé à">
            {signup.verification_sent_at ? formatTs(signup.verification_sent_at) : '—'}
          </Field>
          <Field label="Token expire à">
            {signup.doi_token_expires_at ? (
              <>
                {formatTs(signup.doi_token_expires_at)}
                {tokenExpired && <span className="text-md-warning ml-1 text-xs">(expiré)</span>}
              </>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Adresse IP">
            <code className="text-xs">{String(signup.ip_address ?? '—')}</code>
          </Field>
          <Field label="Référer">{signup.referrer ?? '—'}</Field>
          <Field label="UTM source">{signup.utm_source ?? '—'}</Field>
          <Field label="UTM medium">{signup.utm_medium ?? '—'}</Field>
          <Field label="UTM campaign">{signup.utm_campaign ?? '—'}</Field>
          <Field label="User agent" wide>
            <code className="text-md-text-muted text-[11px] break-all">
              {signup.user_agent ?? '—'}
            </code>
          </Field>
        </dl>
      </SectionCard>

      {/* Section Classification IA */}
      <SectionCard title="Classification IA">
        {ai && isPole ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <PoleBadge code={ai.pole_code as PoleCode} />
              <span className="text-md-text-muted text-xs">
                Confiance {Math.round((ai.confidence ?? 0) * 100)}%
              </span>
              {ai.model && (
                <span className="text-md-text-muted text-[11px]">· modèle : {ai.model}</span>
              )}
            </div>
            {ai.reasoning && (
              <p className="bg-md-bg-soft/50 text-md-text rounded-md p-3 text-xs italic">
                « {ai.reasoning} »
              </p>
            )}
          </div>
        ) : (
          <p className="text-md-text-muted text-sm">
            Pas de classification IA disponible.{' '}
            {signup.derived_category === 'standard' &&
              'Cliquez « Re-classifier » pour relancer Claude Haiku.'}
          </p>
        )}
      </SectionCard>

      {/* Section Étape 2 */}
      {(status === 'step2_started' || status === 'step2_completed' || status === 'converted') && (
        <SectionCard
          title={
            status === 'step2_completed' || status === 'converted'
              ? `Étape 2 — soumise${signup.step2_submitted_at ? ' · ' + formatTs(signup.step2_submitted_at) : ''}`
              : 'Étape 2 — en cours (auto-save)'
          }
        >
          <Step2PayloadView payload={signup.step2_payload} />
        </SectionCard>
      )}

      {/* Section Activité */}
      <SectionCard title="Activité (audit log)">
        <AuditTimeline rows={auditRows} />
      </SectionCard>
    </div>
  );
}

// ===== helpers =====

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </Card>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-md-text-muted text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-md-text mt-0.5">{children}</dd>
    </div>
  );
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pickFirst<T>(rel: T | T[] | null): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

/**
 * Helper sorti du body de la page pour eviter react-hooks/purity sur
 * Date.now(). Utilise dans une server component async, pas re-render.
 */
function isTokenExpired(expiresAtIso: string | null): boolean {
  if (!expiresAtIso) return false;
  return new Date(expiresAtIso).getTime() < Date.now();
}
