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
import { CompanyContactsSection } from '../../companies/[id]/_components/CompanyContactsSection';
import { listContactsForCompany } from '@/lib/contacts/admin-queries';
import { SirenSection } from './SirenSection';
import { DeleteProspectButton } from './DeleteButton';
import { IsTestToggle } from './IsTestToggle';
import { ConciergePaymentLinkDialog } from './ConciergePaymentLinkDialog';
import { SyncBadgesSection } from './SyncBadgesSection';
import { BoothAssignmentSection } from './BoothAssignmentSection';
import { QuoteBuilder } from './_components/QuoteBuilder';
import { getCatalogForAdminQuote } from '@/lib/admin/prospects/catalog';
import { detectIsPremium, type QuoteItem } from '@/lib/admin/prospects/quote-calc';
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
      quote_items, promo_pct, promo_reason, promo_excludes_premium,
      is_test, last_synced_sellsy_at, last_synced_brevo_at, last_synced_stripe_at,
      last_sync_error_message, last_sync_error_provider, last_sync_error_at,
      sellsy_devis_id, sellsy_devis_number, sellsy_devis_public_url, sellsy_devis_emitted_at,
      sellsy_proforma_id, sellsy_proforma_number, sellsy_proforma_public_url, sellsy_proforma_emitted_at,
      sellsy_invoice_id, sellsy_invoice_number, sellsy_invoice_public_url, sellsy_invoice_emitted_at,
      booth_assignment, booth_assigned_at, booth_assigned_by,
      created_at, updated_at, last_activity_at,
      company:companies!inner(id, name, primary_domain, country, category, sellsy_id, was_prs_2026_exhibitor, siren, siret, siren_verified_at, siren_source, pole:poles(code, name_fr)),
      contact:contacts(id, first_name, last_name, email, phone, role),
      owner:users!prospects_owner_id_fkey(id, full_name, email, role),
      booth_assignee:users!prospects_booth_assigned_by_fkey(full_name, email)
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

  // P5.x.22 — tous les contacts de la societe rattachee
  const companyContacts = company ? await listContactsForCompany(company.id) : [];

  // P5.x.23 — alerte SIREN ambigu pour ce prospect (si présente, non résolue)
  const { data: sirenAlertRaw } = await supabase
    .from('admin_alerts')
    .select('id, details')
    .eq('prospect_id', id)
    .eq('kind', 'siren_ambiguous')
    .is('resolved_at', null)
    .maybeSingle();

  interface SirenCandidate {
    siren: string;
    siret: string;
    denomination: string | null;
    ville: string | null;
    address: string | null;
    siege: boolean;
  }
  const sirenAlert = sirenAlertRaw
    ? {
        id: sirenAlertRaw.id,
        candidates:
          (sirenAlertRaw.details as { candidates?: SirenCandidate[] } | null)?.candidates ?? [],
      }
    : null;

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
          <>
            {company?.sellsy_id ? (
              <a
                href={`https://go.sellsy.com/companies/${company.sellsy_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border-md-border bg-card text-md-text hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                title="Ouvrir la fiche société sur Sellsy"
              >
                Voir dans Sellsy ↗
              </a>
            ) : null}
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
          </>
        }
      />

      {/* P5.x.10 — Attribution de stand (booth allocation) */}
      <BoothAssignmentSection
        prospectId={id}
        current={prospect.booth_assignment}
        assignedAt={prospect.booth_assigned_at}
        assigneeName={pickFirst(prospect.booth_assignee)?.full_name ?? null}
      />

      {/* P6.x.5 — Devis Builder */}
      <QuoteBuilder
        prospectId={id}
        initialItems={normalizeQuoteItems(prospect.quote_items)}
        initialPromoPct={Number(prospect.promo_pct ?? 0)}
        initialPromoReason={prospect.promo_reason}
        initialExcludesPremium={prospect.promo_excludes_premium ?? true}
        catalog={await getCatalogForAdminQuote()}
        alreadyEmitted={Boolean(prospect.sellsy_devis_id)}
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

      {/* SIREN INSEE (P5.x.23) — visible si pays FR */}
      {company && company.country === 'FR' ? (
        <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            SIREN INSEE
          </h2>
          <SirenSection
            prospectId={id}
            companyId={company.id}
            siren={company.siren ?? null}
            sirenVerifiedAt={company.siren_verified_at ?? null}
            sirenSource={company.siren_source ?? null}
            ambiguousAlert={sirenAlert}
          />
        </section>
      ) : null}

      {/* Contacts de la societe (P5.x.22) */}
      {company ? (
        <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
            Contacts de {company.name} ({companyContacts.length})
          </h2>
          <CompanyContactsSection
            companyId={company.id}
            contacts={companyContacts}
            canDelete={profile.role === 'admin'}
          />
        </section>
      ) : null}

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

/**
 * P6.x.5 — convertit le JSONB `prospects.quote_items` en QuoteItem[] typé.
 * Tolérant : ignore les entrées malformées + recalcule is_premium au cas où
 * un drift catalogue se serait produit.
 */
function normalizeQuoteItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.sellsy_product_id !== 'number') continue;
    if (typeof o.reference !== 'string') continue;
    out.push({
      sellsy_product_id: o.sellsy_product_id,
      reference: o.reference,
      name: typeof o.name === 'string' ? o.name : o.reference,
      unit_price_ht: Number(o.unit_price_ht) || 0,
      qty: Math.max(1, Math.min(99, Number(o.qty) || 1)),
      category: typeof o.category === 'string' ? o.category : 'option',
      sub_category: typeof o.sub_category === 'string' ? o.sub_category : null,
      is_premium:
        typeof o.is_premium === 'boolean'
          ? o.is_premium
          : detectIsPremium({
              sub_category: typeof o.sub_category === 'string' ? o.sub_category : null,
              reference: o.reference,
            }),
    });
  }
  return out;
}
