import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, Inbox } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { POLE_CODES } from '@/lib/design-tokens';
import { listSignups } from './queries';
import { SignupsListClient } from './SignupsListClient';
import {
  SIGNUP_STATUSES,
  SIGNUP_STATUS_LABEL,
  SIGNUP_CATEGORIES,
  type SignupStatus,
} from './types';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Inscriptions web' };

const PER_PAGE = 50;

type SearchParams = Promise<{
  q?: string;
  status?: string;
  category?: string;
  pole?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
}>;

export default async function SignupsListPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireAdminProfile();
  // RLS deja restrictive (admin only) — on bloque cote UI pour l'UX.
  if (profile.role !== 'admin') {
    redirect('/admin?error=signups_admin_only');
  }

  const params = await searchParams;

  const status =
    params.status && (SIGNUP_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as SignupStatus)
      : null;
  const category =
    params.category === 'exposant' || params.category === 'partenaire' ? params.category : null;
  const poleCode =
    params.pole && (POLE_CODES as readonly string[]).includes(params.pole) ? params.pole : null;
  const dateFrom = params.date_from?.match(/^\d{4}-\d{2}-\d{2}$/) ? params.date_from : null;
  const dateTo = params.date_to?.match(/^\d{4}-\d{2}-\d{2}$/) ? params.date_to : null;
  const page = Math.max(1, Number(params.page ?? '1'));
  const q = params.q?.trim() ?? '';

  const { rows, total } = await listSignups({
    q: q || undefined,
    status,
    category,
    poleCode,
    dateFrom,
    dateTo,
    page,
    perPage: PER_PAGE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilter = !!(q || status || category || poleCode || dateFrom || dateTo);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Inscriptions web · {total}
        </h1>
        <p className="text-md-text-muted text-xs">
          File à modérer — convertir, rejeter ou re-classifier l&apos;IA.
        </p>
      </div>

      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-end gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Email, société, prénom, nom…"
            className="pl-9"
          />
        </div>

        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="Statut"
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous statuts</option>
          {SIGNUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SIGNUP_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={category ?? ''}
          aria-label="Catégorie"
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes catégories</option>
          {SIGNUP_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === 'exposant' ? 'Exposant' : 'Partenaire'}
            </option>
          ))}
        </select>

        <select
          name="pole"
          defaultValue={poleCode ?? ''}
          aria-label="Pôle (IA)"
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous pôles</option>
          {POLE_CODES.filter((c) => c !== 'INCONNU').map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <Input
          type="date"
          name="date_from"
          defaultValue={dateFrom ?? ''}
          aria-label="Du"
          className="w-36"
        />
        <Input
          type="date"
          name="date_to"
          defaultValue={dateTo ?? ''}
          aria-label="Au"
          className="w-36"
        />

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {hasFilter && (
          <Link
            href="/admin/signups"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {rows.length === 0 ? <EmptyState filtered={hasFilter} /> : <SignupsListClient rows={rows} />}

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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="border-md-border flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <Inbox className="text-md-text-muted size-8" aria-hidden />
      <p className="text-md-text font-medium">
        {filtered ? 'Aucune inscription pour ces filtres.' : "Aucune inscription pour l'instant."}
      </p>
      <p className="text-md-text-muted text-xs">
        {filtered
          ? 'Essaie de relâcher les filtres ou de vider la recherche.'
          : 'Les inscriptions soumises depuis le formulaire public apparaîtront ici.'}
      </p>
    </div>
  );
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') sp.set(key, val);
  }
  const qs = sp.toString();
  return qs ? `/admin/signups?${qs}` : '/admin/signups';
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
            <span key={`ellipsis-${i}`} className="text-md-text-muted px-2 py-1">
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
