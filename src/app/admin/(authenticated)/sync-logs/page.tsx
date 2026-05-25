import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import {
  listSyncLogs,
  getSyncLogsKpis,
  SYNC_TARGETS,
  SYNC_OPS,
  SYNC_STATUSES,
  type SyncTarget,
  type SyncOp,
  type SyncStatus,
} from '@/lib/admin/sync-logs/queries';
import { SyncLogsTable } from './SyncLogsTable';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Logs sync' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

type SearchParams = Promise<{
  target?: string;
  operation?: string;
  status?: string;
  from?: string;
  to?: string;
  entity_id?: string;
  page?: string;
}>;

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/sync-logs?${qs}` : '/admin/sync-logs';
}

export default async function SyncLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role) && profile.role !== 'sales') {
    redirect('/admin?error=admin_only');
  }

  const params = await searchParams;

  const target =
    params.target && (SYNC_TARGETS as readonly string[]).includes(params.target)
      ? (params.target as SyncTarget)
      : undefined;
  const operation =
    params.operation && (SYNC_OPS as readonly string[]).includes(params.operation)
      ? (params.operation as SyncOp)
      : undefined;
  const status =
    params.status && (SYNC_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as SyncStatus)
      : undefined;
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;
  const entityId =
    params.entity_id && /^[0-9a-f-]{36}$/i.test(params.entity_id) ? params.entity_id : undefined;
  const page = Math.max(1, Number(params.page ?? '1'));

  const [kpis, { rows, total }] = await Promise.all([
    getSyncLogsKpis(),
    listSyncLogs({
      target,
      operation,
      status,
      from,
      to,
      entity_id: entityId,
      page,
      page_size: PER_PAGE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = Boolean(target || operation || status || from || to || entityId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Logs sync · {total}
        </h1>
        <p className="text-md-text-muted text-sm">
          Historique des appels API externes (Sellsy, Stripe, Brevo). Lecture seule.
        </p>
      </header>

      {/* KPIs 7 jours */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total 7 jours"
          value={kpis.total_7d.toLocaleString('fr-FR')}
          accent="default"
        />
        <KpiCard
          label="Erreurs 7 jours"
          value={kpis.errors_7d.toLocaleString('fr-FR')}
          accent={kpis.errors_7d > 0 ? 'red' : 'emerald'}
        />
        <KpiCard
          label="Taux d&rsquo;erreur"
          value={`${kpis.error_rate_7d.toLocaleString('fr-FR')} %`}
          accent={kpis.error_rate_7d < 1 ? 'emerald' : kpis.error_rate_7d < 5 ? 'orange' : 'red'}
        />
        <KpiCard
          label="Top intégration en erreur"
          value={kpis.top_target_in_error ?? '—'}
          accent={kpis.top_target_in_error ? 'red' : 'default'}
        />
      </div>

      {/* Filtres */}
      <form
        method="get"
        className="bg-card border-md-border grid grid-cols-1 gap-3 rounded-xl border p-4 shadow-sm md:grid-cols-6"
      >
        <FilterField label="Intégration">
          <select
            name="target"
            defaultValue={target ?? ''}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Toutes</option>
            {SYNC_TARGETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Opération">
          <select
            name="operation"
            defaultValue={operation ?? ''}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Toutes</option>
            {SYNC_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Statut">
          <select
            name="status"
            defaultValue={status ?? ''}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Tous</option>
            {SYNC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Du">
          <Input name="from" type="date" defaultValue={from ?? ''} />
        </FilterField>
        <FilterField label="Au">
          <Input name="to" type="date" defaultValue={to ?? ''} />
        </FilterField>
        <FilterField label="ID entité (UUID)">
          <Input
            name="entity_id"
            type="text"
            placeholder="uuid…"
            defaultValue={entityId ?? ''}
            className="font-mono text-xs"
          />
        </FilterField>

        <div className="flex items-end justify-end gap-2 md:col-span-6">
          {hasFilters && (
            <Link
              href="/admin/sync-logs"
              className="text-md-text-muted hover:text-md-text text-xs underline"
            >
              Réinitialiser
            </Link>
          )}
          <button
            type="submit"
            className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
          >
            Appliquer
          </button>
        </div>
      </form>

      <SyncLogsTable rows={rows} />

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(p) => buildHref({ ...params, page: String(p) })}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'default' | 'emerald' | 'orange' | 'red';
}) {
  const accentClass = {
    default: 'text-md-text',
    emerald: 'text-emerald-700',
    orange: 'text-orange-700',
    red: 'text-red-700',
  }[accent];
  return (
    <div className="border-md-border bg-card rounded-lg border p-3 text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</div>
      <div className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
        {label}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-bold tracking-widest uppercase">{label}</Label>
      {children}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  const pages = pageRange(currentPage, totalPages);
  return (
    <nav className="flex items-center justify-between text-xs" aria-label="Pagination">
      <span className="text-md-text-muted">
        Page {currentPage} / {totalPages}
      </span>
      <div className="flex gap-1">
        {currentPage > 1 ? (
          <PaginationLink href={buildHref(currentPage - 1)}>‹</PaginationLink>
        ) : (
          <PaginationDisabled>‹</PaginationDisabled>
        )}
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e-${i}`} className="text-md-text-muted px-2 py-1">
              …
            </span>
          ) : (
            <PaginationLink key={p} href={buildHref(p)} active={p === currentPage}>
              {p}
            </PaginationLink>
          ),
        )}
        {currentPage < totalPages ? (
          <PaginationLink href={buildHref(currentPage + 1)}>›</PaginationLink>
        ) : (
          <PaginationDisabled>›</PaginationDisabled>
        )}
      </div>
    </nav>
  );
}

function PaginationLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
        active
          ? 'border-md-magenta/40 bg-md-magenta/10 text-md-magenta'
          : 'border-md-border hover:bg-muted bg-white',
      )}
    >
      {children}
    </Link>
  );
}

function PaginationDisabled({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-md-border text-md-text-muted rounded-md border bg-white px-2 py-1 text-[11px] font-semibold opacity-40">
      {children}
    </span>
  );
}

function pageRange(current: number, total: number): (number | '…')[] {
  const window = 1;
  const items = new Set<number>([1, total, current]);
  for (let i = 1; i <= window; i += 1) {
    if (current - i >= 1) items.add(current - i);
    if (current + i <= total) items.add(current + i);
  }
  const sorted = [...items].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}
