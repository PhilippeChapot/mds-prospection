import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { AuditLogTable, type AuditLogRow } from '@/components/admin/AuditLogTable';
import type { Database } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Audit log' };

type AuditAction = Database['public']['Enums']['audit_action'];

const PER_PAGE = 50;

const ENTITY_TYPES = ['prospects', 'companies', 'contacts', 'activities', 'app_settings'] as const;
const ACTION_VALUES: AuditAction[] = [
  'create',
  'update',
  'delete',
  'login',
  'rgpd_rtbf',
  'rgpd_export',
  'sync_manual',
];

type SearchParams = Promise<{
  actor?: string;
  entity_type?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/audit-log?${qs}` : '/admin/audit-log';
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  if (profile.role !== 'admin') {
    redirect('/admin?error=admin_only');
  }

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const actor = params.actor && /^[0-9a-f-]{36}$/i.test(params.actor) ? params.actor : '';
  const entityType =
    params.entity_type && (ENTITY_TYPES as readonly string[]).includes(params.entity_type)
      ? params.entity_type
      : '';
  const action =
    params.action && ACTION_VALUES.includes(params.action as AuditAction)
      ? (params.action as AuditAction)
      : null;
  const from = params.from?.trim() ?? '';
  const to = params.to?.trim() ?? '';
  const page = Math.max(1, Number(params.page ?? '1'));

  // Liste des acteurs (admin/sales) pour le filtre.
  const { data: actorsData } = await supabase
    .from('users')
    .select('id, full_name, email, role')
    .in('role', ['admin', 'sales'])
    .order('full_name', { ascending: true });
  const actors = (actorsData ?? []).map((u) => ({
    id: u.id,
    label: `${u.full_name?.trim() || u.email} · ${u.role}`,
  }));

  // Build query
  const offset = (page - 1) * PER_PAGE;
  let query = supabase
    .from('audit_log')
    .select(
      'id, action, entity_type, entity_id, before, after, created_at, user:users(full_name, email)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (actor) query = query.eq('user_id', actor);
  if (entityType) query = query.eq('entity_type', entityType);
  if (action) query = query.eq('action', action);
  if (from) query = query.gte('created_at', from);
  if (to) {
    // Inclure toute la journee de fin
    const toEnd = new Date(to);
    if (!Number.isNaN(toEnd.getTime())) {
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }
  }

  const { data, count } = await query;
  const rows: AuditLogRow[] = (data ?? []).map((row) => {
    const user = Array.isArray(row.user) ? row.user[0] : row.user;
    return {
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      before: row.before as Record<string, unknown> | null,
      after: row.after as Record<string, unknown> | null,
      created_at: row.created_at,
      user: user ?? null,
    };
  });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = Boolean(actor || entityType || action || from || to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Audit log · {total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Historique des actions admin sensibles. Lecture seule. Triggers Postgres
            <code className="ml-1 text-xs">fn_audit_log()</code>.
          </p>
        </div>
      </div>

      <form
        method="get"
        className="bg-card border-md-border grid grid-cols-1 gap-3 rounded-xl border p-4 shadow-sm md:grid-cols-5"
      >
        <FilterField label="Acteur">
          <select
            name="actor"
            defaultValue={actor}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Tous</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Entite">
          <select
            name="entity_type"
            defaultValue={entityType}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Toutes</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Action">
          <select
            name="action"
            defaultValue={action ?? ''}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-xs"
          >
            <option value="">Toutes</option>
            {ACTION_VALUES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Du">
          <Input name="from" type="date" defaultValue={from} />
        </FilterField>
        <FilterField label="Au">
          <Input name="to" type="date" defaultValue={to} />
        </FilterField>

        <div className="flex items-end justify-end gap-2 md:col-span-5">
          {hasFilters && (
            <Link
              href="/admin/audit-log"
              className="text-md-text-muted hover:text-md-text text-xs underline"
            >
              Reinitialiser
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

      <AuditLogTable rows={rows} />

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
