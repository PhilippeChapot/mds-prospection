import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { NotesEditor } from '@/components/admin/NotesEditor';
import { AuditTimeline, type AuditRow } from '@/components/admin/AuditTimeline';
import { LinkedProspectsTable, type LinkedProspect } from '@/components/admin/LinkedProspectsTable';
import { ExternalEventBadges } from '@/components/admin/ExternalEventBadges';
import { DeleteCompanyButton } from './DeleteButton';
import { updateCompanyNotesAction } from './actions';
import { CompanyContactsSection } from './_components/CompanyContactsSection';
import { listContactsForCompany } from '@/lib/contacts/admin-queries';
import type { PoleCode } from '@/lib/design-tokens';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Fiche societe' };

const CATEGORY_LABEL: Record<string, string> = {
  prs_exhibitor: 'PRS partenaire',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const { data: company } = await supabase
    .from('companies')
    .select(
      `
      id, name, primary_domain, alternate_domains, country, category, was_prs_2026_exhibitor, external_event_tags, notes,
      created_at, updated_at,
      pole:poles(code, name_fr)
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (!company) notFound();

  const pole = pickFirst(company.pole);

  // P5.x.22 — contacts liés à cette société
  const companyContacts = await listContactsForCompany(id);

  // Prospects lies (via RLS, sales ne voit que les siens — comportement attendu)
  const { data: prospectsData } = await supabase
    .from('prospects')
    .select(
      `
      id, status, pack_code, estimated_amount, created_at,
      contact:contacts(email),
      owner:users!prospects_owner_id_fkey(full_name, email)
    `,
    )
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const linkedProspects: LinkedProspect[] = (prospectsData ?? []).map((p) => {
    const contact = pickFirst(p.contact);
    const owner = pickFirst(p.owner);
    return {
      id: p.id,
      status: p.status,
      pack_code: p.pack_code,
      estimated_amount: p.estimated_amount,
      contact_email: contact?.email ?? null,
      owner_label: owner?.full_name?.trim() || owner?.email || null,
      created_at: p.created_at,
    };
  });

  // Audit
  const { data: auditData } = await supabase
    .from('audit_log')
    .select('id, action, before, after, created_at, user:users(full_name, email)')
    .eq('entity_type', 'companies')
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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/companies"
            className="text-md-text-muted mb-2 inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Retour aux societes
          </Link>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {company.name}
          </h1>
          <div className="text-md-text-muted mt-1 flex flex-wrap items-center gap-3 text-sm">
            {company.primary_domain && (
              <a
                className="text-md-blue inline-flex items-center gap-1 hover:underline"
                href={`https://${company.primary_domain}`}
                target="_blank"
                rel="noreferrer"
              >
                {company.primary_domain}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {company.country && <span>{company.country}</span>}
          </div>
          <div className="mt-2">
            <ExternalEventBadges
              tags={company.external_event_tags as Record<string, unknown>}
              size="sm"
            />
          </div>
          {company.alternate_domains && company.alternate_domains.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-md-text-muted">Aussi :</span>
              {company.alternate_domains.map((d) => (
                <a
                  key={d}
                  href={`https://${d}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-md-blue/10 text-md-blue rounded px-1.5 py-0.5 font-mono hover:underline"
                >
                  {d}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/admin/prospects/new?company_id=${company.id}`}>
              <Plus className="size-4" aria-hidden />
              Nouveau prospect
            </Link>
          </Button>
          {hasAdminAccess(profile.role) ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/companies/${id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  Editer
                </Link>
              </Button>
              <DeleteCompanyButton companyId={id} prospectCount={linkedProspects.length} />
            </>
          ) : null}
        </div>
      </div>

      {/* Resume metadata */}
      <div className="bg-card border-md-border flex flex-wrap items-center gap-4 rounded-xl border p-4 shadow-sm">
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Pole
          </div>
          {pole ? (
            <PoleBadge code={pole.code as PoleCode} />
          ) : (
            <span className="text-md-text-muted text-xs">Non classe</span>
          )}
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Categorie
          </div>
          <span className="text-md-text font-semibold">
            {CATEGORY_LABEL[company.category] ?? company.category}
          </span>
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Prospects lies
          </div>
          <span className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-xl font-extrabold">
            {linkedProspects.length}
          </span>
        </div>
        <Divider />
        <div>
          <div className="text-md-text-muted mb-1 text-[10px] font-bold tracking-widest uppercase">
            Cree le
          </div>
          <span className="text-md-text text-xs">
            {new Date(company.created_at).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Notes */}
      <Section title="Notes societe">
        {hasAdminAccess(profile.role) ? (
          <NotesEditor
            entityId={id}
            initialNotes={company.notes ?? ''}
            action={updateCompanyNotesAction}
            placeholder="Contexte societe, contacts cles, opportunites…"
          />
        ) : (
          <div className="border-md-border bg-muted/30 rounded-md border p-3 text-sm">
            {company.notes ? (
              <p className="text-md-text whitespace-pre-wrap">{company.notes}</p>
            ) : (
              <p className="text-md-text-muted">Aucune note. Seul un admin peut editer.</p>
            )}
          </div>
        )}
      </Section>

      {/* Contacts de la societe (P5.x.22) */}
      <Section title={`Contacts (${companyContacts.length})`}>
        <CompanyContactsSection
          companyId={id}
          contacts={companyContacts}
          canDelete={hasAdminAccess(profile.role)}
        />
      </Section>

      {/* Prospects lies */}
      <Section title="Prospects lies">
        <LinkedProspectsTable rows={linkedProspects} />
      </Section>

      {/* Audit */}
      <Section title="Historique audit">
        <AuditTimeline rows={auditRows} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border-md-border space-y-3 rounded-xl border p-5 shadow-sm">
      <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Divider() {
  return <span className="bg-md-border hidden h-10 w-px md:inline-block" aria-hidden />;
}

type MaybeArray<T> = T | T[] | null | undefined;
function pickFirst<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}
