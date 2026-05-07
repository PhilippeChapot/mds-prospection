import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { StatusEditor } from '@/components/admin/StatusEditor';
import { NotesEditor } from '@/components/admin/NotesEditor';
import { updateProspectNotesAction } from './actions';
import { ActivitiesSection, type ActivityRow } from '@/components/admin/ActivitiesSection';
import { AuditTimeline, type AuditRow } from '@/components/admin/AuditTimeline';
import { DeleteProspectButton } from './DeleteButton';
import { IsTestToggle } from './IsTestToggle';
import { ConciergePaymentLinkDialog } from './ConciergePaymentLinkDialog';
import { SyncBadgesSection } from './SyncBadgesSection';
import { PACK_LABEL } from '@/lib/supabase/queries';
import type { PoleCode } from '@/lib/design-tokens';
import type { Database } from '@/lib/supabase/database.types';

export const metadata = { title: 'Fiche prospect' };

type ProspectStatus = Database['public']['Enums']['prospect_status'];

function formatEur(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value).toLocaleString('fr-FR')} € HT`;
}

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const { data: prospect, error } = await supabase
    .from('prospects')
    .select(
      `
      id, status, pack_code, payment_path, estimated_amount, notes, owner_id, affiliate_id,
      is_test, last_synced_sellsy_at, last_synced_brevo_at, last_synced_stripe_at,
      last_sync_error_message, last_sync_error_provider, last_sync_error_at,
      sellsy_devis_id, sellsy_devis_number, sellsy_devis_public_url, sellsy_devis_emitted_at,
      sellsy_proforma_id, sellsy_proforma_number, sellsy_proforma_public_url, sellsy_proforma_emitted_at,
      sellsy_invoice_id, sellsy_invoice_number, sellsy_invoice_public_url, sellsy_invoice_emitted_at,
      created_at, updated_at, last_activity_at,
      company:companies!inner(id, name, primary_domain, country, category, was_prs_2026_exhibitor, pole:poles(code, name_fr)),
      contact:contacts(id, first_name, last_name, email, phone, role),
      owner:users!prospects_owner_id_fkey(id, full_name, email, role)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) console.error('[admin/prospects/[id]] fetch error:', error);
  if (!prospect) notFound();

  // Normalisation relations
  const company = pickFirst(prospect.company);
  const contact = pickFirst(prospect.contact);
  const owner = pickFirst(prospect.owner);
  const pole = pickFirst(company?.pole ?? null);

  // Activites
  const { data: activitiesData } = await supabase
    .from('activities')
    .select('id, type, body, title, created_at, user:users(full_name, email)')
    .eq('prospect_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const activities: ActivityRow[] = (activitiesData ?? []).map((a) => {
    const user = pickFirst(a.user);
    return {
      id: a.id,
      type: a.type,
      body: a.body,
      title: a.title,
      created_at: a.created_at,
      user_full_name: user?.full_name?.trim() || user?.email || null,
    };
  });

  // Audit
  const { data: auditData } = await supabase
    .from('audit_log')
    .select('id, action, before, after, created_at, user:users(full_name, email)')
    .eq('entity_type', 'prospects')
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

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
    : '';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/prospects"
            className="text-md-text-muted mb-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Retour aux prospects
          </Link>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {company?.name ?? 'Societe inconnue'}
          </h1>
          {contactName && (
            <p className="text-md-text-muted mt-1 text-sm">
              Contact : <strong className="text-md-text">{contactName}</strong>
              {contact?.role ? <span className="text-md-text-muted"> · {contact.role}</span> : null}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {profile.role === 'admin' && <IsTestToggle prospectId={id} isTest={prospect.is_test} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/prospects/${id}/edit`}>
              <Pencil className="size-4" aria-hidden />
              Editer
            </Link>
          </Button>
          {profile.role === 'admin' ? <DeleteProspectButton prospectId={id} /> : null}
        </div>
      </div>

      {/* Resume metadata */}
      <div className="bg-card border-md-border flex flex-wrap items-center gap-4 rounded-xl border p-4 shadow-sm">
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Statut
          </div>
          <StatusEditor prospectId={id} currentStatus={prospect.status as ProspectStatus} />
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Pole
          </div>
          {pole ? (
            <PoleBadge code={pole.code as PoleCode} />
          ) : (
            <span className="text-md-text-muted text-xs">—</span>
          )}
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Pack
          </div>
          <span className="text-md-text font-semibold">{PACK_LABEL[prospect.pack_code]}</span>
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Montant estime
          </div>
          <span className="text-md-magenta font-[family-name:var(--font-montserrat)] text-xl font-extrabold">
            {formatEur(prospect.estimated_amount)}
          </span>
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Categorie
          </div>
          <span className="text-md-text font-semibold capitalize">
            {company?.category?.replace('_', ' ') ?? '—'}
          </span>
        </div>
      </div>

      {/* Synchronisations externes (Sellsy / Stripe / Brevo) — P4 */}
      <SyncBadgesSection
        prospectId={id}
        isTest={prospect.is_test}
        hasSellsyDocument={
          !!prospect.sellsy_devis_id ||
          !!prospect.sellsy_proforma_id ||
          !!prospect.sellsy_invoice_id
        }
        isCasB={!prospect.payment_path && !prospect.pack_code}
        sellsy={{
          lastSyncedAt: prospect.last_synced_sellsy_at,
          errorMessage:
            prospect.last_sync_error_provider === 'sellsy'
              ? prospect.last_sync_error_message
              : null,
          errorAt:
            prospect.last_sync_error_provider === 'sellsy' ? prospect.last_sync_error_at : null,
          devis: prospect.sellsy_devis_id
            ? {
                number: prospect.sellsy_devis_number,
                publicUrl: prospect.sellsy_devis_public_url,
                emittedAt: prospect.sellsy_devis_emitted_at,
              }
            : null,
          proforma: prospect.sellsy_proforma_id
            ? {
                number: prospect.sellsy_proforma_number,
                publicUrl: prospect.sellsy_proforma_public_url,
                emittedAt: prospect.sellsy_proforma_emitted_at,
              }
            : null,
          invoice: prospect.sellsy_invoice_id
            ? {
                number: prospect.sellsy_invoice_number,
                publicUrl: prospect.sellsy_invoice_public_url,
                emittedAt: prospect.sellsy_invoice_emitted_at,
              }
            : null,
        }}
        stripe={{ lastSyncedAt: prospect.last_synced_stripe_at }}
        brevo={{ lastSyncedAt: prospect.last_synced_brevo_at }}
        extraActions={
          <ConciergePaymentLinkDialog
            prospectId={id}
            isTest={prospect.is_test}
            defaultAmountHt={prospect.estimated_amount}
            defaultDescription={
              prospect.sellsy_devis_number
                ? `${prospect.sellsy_devis_number} — MediaDays Solutions 2026`
                : 'MediaDays Solutions 2026'
            }
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Coordonnees */}
        <Section title="Coordonnees">
          {contact ? (
            <dl className="space-y-3 text-sm">
              <DefRow label="Email">
                <a className="text-md-blue hover:underline" href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              </DefRow>
              {contact.phone && (
                <DefRow label="Telephone">
                  <a className="text-md-blue hover:underline" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </DefRow>
              )}
              {contact.role && <DefRow label="Fonction">{contact.role}</DefRow>}
              {company?.primary_domain && (
                <DefRow label="Site societe">
                  <a
                    className="text-md-blue hover:underline"
                    href={`https://${company.primary_domain}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {company.primary_domain}
                  </a>
                </DefRow>
              )}
              {company?.country && <DefRow label="Pays">{company.country}</DefRow>}
            </dl>
          ) : (
            <p className="text-md-text-muted text-sm">Aucun contact rattache.</p>
          )}
        </Section>

        {/* Affectation */}
        <Section title="Affectation">
          <dl className="space-y-3 text-sm">
            <DefRow label="Owner">
              {owner ? (
                <span className="text-md-text font-semibold">
                  {owner.full_name?.trim() || owner.email}{' '}
                  <span className="text-md-text-muted text-xs">· {owner.role}</span>
                </span>
              ) : (
                <span className="text-md-text-muted">Non assigne</span>
              )}
            </DefRow>
            <DefRow label="Affilie">
              <span className="text-md-text-muted">
                {prospect.affiliate_id ? prospect.affiliate_id : '—'}{' '}
                <span className="text-xs">(P3 ajoutera l&apos;affichage du nom)</span>
              </span>
            </DefRow>
          </dl>
        </Section>

        {/* Notes */}
        <Section title="Notes" full>
          <NotesEditor
            entityId={id}
            initialNotes={prospect.notes ?? ''}
            action={updateProspectNotesAction}
          />
        </Section>
      </div>

      {/* Activites */}
      <Section title="Activites">
        <ActivitiesSection prospectId={id} activities={activities} />
      </Section>

      {/* Audit */}
      <Section title="Historique audit">
        <AuditTimeline rows={auditRows} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section
      className={`bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm ${
        full ? 'lg:col-span-2' : ''
      }`}
    >
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Divider() {
  return <span className="bg-md-border hidden h-10 w-px md:inline-block" aria-hidden />;
}

function DefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-md-text-muted w-24 shrink-0 text-[10px] font-bold tracking-widest uppercase">
        {label}
      </dt>
      <dd className="text-md-text">{children}</dd>
    </div>
  );
}

type MaybeArray<T> = T | T[] | null | undefined;
function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
