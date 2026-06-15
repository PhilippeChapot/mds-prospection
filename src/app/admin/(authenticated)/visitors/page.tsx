import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { POLE_CODES } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import { listVisitorsAction, getVisitorStatsAction } from '@/lib/admin/visitors/list-actions';
import {
  VISITOR_TYPES,
  VISITOR_TYPE_LABEL,
  VISITOR_STATUSES,
  VISITOR_STATUS_LABEL,
  VISITOR_LANGUAGES,
  VISITOR_LANGUAGE_LABEL,
} from '@/lib/visitors/constants';
import { VisitorsListClient } from './VisitorsListClient';

export const metadata = { title: 'Visiteurs' };

const PER_PAGE = 50;

type SearchParams = Promise<{
  q?: string;
  pole?: string;
  status?: string;
  type?: string;
  vip?: string;
  language?: string;
  page?: string;
}>;

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/visitors?${qs}` : '/admin/visitors';
}

export default async function VisitorsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminProfile();
  const params = await searchParams;

  const q = params.q?.trim() ?? '';
  const poleFilter =
    params.pole && (POLE_CODES as readonly string[]).includes(params.pole) ? params.pole : '';
  const statusFilter =
    params.status && (VISITOR_STATUSES as readonly string[]).includes(params.status)
      ? params.status
      : '';
  const typeFilter =
    params.type && (VISITOR_TYPES as readonly string[]).includes(params.type) ? params.type : '';
  const languageFilter =
    params.language && (VISITOR_LANGUAGES as readonly string[]).includes(params.language)
      ? params.language
      : '';
  const vipOnly = params.vip === '1';
  const page = Math.max(1, Number(params.page ?? '1'));

  const [{ rows, total }, stats] = await Promise.all([
    listVisitorsAction({
      query: q || undefined,
      pole: poleFilter || null,
      status: statusFilter || null,
      visitorType: typeFilter || null,
      language: languageFilter || null,
      isVip: vipOnly ? true : null,
      page,
      perPage: PER_PAGE,
    }),
    getVisitorStatsAction(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = Boolean(
    q || poleFilter || statusFilter || typeFilter || languageFilter || vipOnly,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Visiteurs · {total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Visiteurs du salon (distinct des partenaires). Ajout manuel ou inscription web.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/visitors/new">
            <Plus className="size-4" aria-hidden />
            Nouveau visiteur
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total visiteurs" value={stats.total} />
        <StatCard label="VIP" value={stats.vip} emoji="🌟" />
        <StatCard label="Confirmés" value={stats.confirmed} emoji="✅" />
      </div>

      {/* Filtres URL — server-side */}
      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom ou email…"
            className="pl-9"
          />
        </div>

        <select
          name="pole"
          defaultValue={poleFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous pôles</option>
          {POLE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={statusFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous statuts</option>
          {VISITOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {VISITOR_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          name="type"
          defaultValue={typeFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous types</option>
          {VISITOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {VISITOR_TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        <select
          name="language"
          defaultValue={languageFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes langues</option>
          {VISITOR_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {VISITOR_LANGUAGE_LABEL[l]}
            </option>
          ))}
        </select>

        <label className="text-md-text-muted inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="vip"
            value="1"
            defaultChecked={vipOnly}
            className="size-3.5"
          />
          VIP uniquement
        </label>

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {hasFilters && (
          <Link
            href="/admin/visitors"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      <VisitorsListClient rows={rows} />

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

function StatCard({ label, value, emoji }: { label: string; value: number; emoji?: string }) {
  return (
    <div className="bg-card border-md-border rounded-xl border p-4 shadow-sm">
      <div className="text-md-text-muted text-xs font-semibold tracking-wide uppercase">
        {emoji ? <span className="mr-1">{emoji}</span> : null}
        {label}
      </div>
      <div className="text-md-blue-dark mt-1 text-2xl font-extrabold">{value}</div>
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
  return (
    <nav className="flex items-center justify-between text-xs" aria-label="Pagination">
      <span className="text-md-text-muted">
        Page {currentPage} / {totalPages}
      </span>
      <div className="flex gap-1">
        {currentPage > 1 ? (
          <PaginationLink href={buildHref(currentPage - 1)}>‹ Précédent</PaginationLink>
        ) : null}
        {currentPage < totalPages ? (
          <PaginationLink href={buildHref(currentPage + 1)}>Suivant ›</PaginationLink>
        ) : null}
      </div>
    </nav>
  );
}

function PaginationLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'border-md-border hover:bg-muted rounded-md border bg-white px-2 py-1 text-[11px] font-semibold',
      )}
    >
      {children}
    </Link>
  );
}
