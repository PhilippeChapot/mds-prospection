import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProspectsListClient } from './ProspectsListClient';
import { SavedViewsBar } from '@/components/admin/SavedViewsBar';
import {
  PROSPECT_STATUSES,
  listProspectsPaginated,
  type ProspectStatus,
} from '@/lib/supabase/queries';
import { POLE_CODES } from '@/lib/design-tokens';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Prospects' };

const STATUS_LABEL: Record<ProspectStatus, string> = {
  lead: 'Lead',
  contact: 'En contact',
  devis_envoye: 'Devis envoye',
  acompte_paye: 'Acompte paye',
  signe: 'Signe',
  perdu: 'Perdu',
};

const PER_PAGE = 25;

type SearchParams = Promise<{
  q?: string;
  status?: string;
  pole?: string;
  owner?: string;
  page?: string;
}>;

export default async function ProspectsListPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireAdminProfile();

  const status =
    params.status && (PROSPECT_STATUSES as string[]).includes(params.status)
      ? (params.status as ProspectStatus)
      : null;
  const poleCode =
    params.pole && (POLE_CODES as readonly string[]).includes(params.pole) ? params.pole : null;

  const ownerFilter = profile.role === 'admin' ? (params.owner ?? null) : profile.id;
  const page = Math.max(1, Number(params.page ?? '1'));
  const q = params.q?.trim() ?? '';

  const { rows, total } = await listProspectsPaginated({
    q: q || undefined,
    status,
    poleCode,
    ownerId: ownerFilter || null,
    page,
    perPage: PER_PAGE,
  });

  let owners: { id: string; label: string }[] = [];
  if (profile.role === 'admin') {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'sales'])
      .order('full_name', { ascending: true });
    owners = (data ?? []).map((u) => ({
      id: u.id,
      label: `${u.full_name?.trim() || u.email} · ${u.role}`,
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          Prospects · {total}
        </h1>
        <Button asChild>
          <Link href="/admin/prospects/new">
            <Plus className="size-4" aria-hidden />
            Nouveau prospect
          </Link>
        </Button>
      </div>

      <SavedViewsBar currentUserId={profile.id} />

      <form
        method="get"
        className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="text-md-text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Rechercher societe ou domaine…"
            className="pl-9"
          />
        </div>

        <select
          name="status"
          defaultValue={status ?? ''}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous statuts</option>
          {PROSPECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          name="pole"
          defaultValue={poleCode ?? ''}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous poles</option>
          {POLE_CODES.filter((c) => c !== 'INCONNU').map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {profile.role === 'admin' && owners.length > 0 ? (
          <select
            name="owner"
            defaultValue={ownerFilter ?? ''}
            className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="">Tous owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {(q || status || poleCode || (profile.role === 'admin' && params.owner)) && (
          <Link
            href="/admin/prospects"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      <ProspectsListClient
        rows={rows}
        owners={owners}
        currentRole={profile.role}
        filters={{
          q: q || undefined,
          status: status ?? undefined,
          pole: poleCode ?? undefined,
          owner: ownerFilter ?? undefined,
        }}
      />

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(p) => buildHref({ ...params, page: String(p) })}
        />
      )}

      {profile.role === 'sales' && (
        <p className="text-md-text-muted border-md-border bg-muted/30 rounded-md border border-dashed px-4 py-3 text-xs">
          Compte <strong>sales</strong> : tu ne vois que tes propres prospects (filtrage RLS sur
          owner_id).
        </p>
      )}
    </div>
  );
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') sp.set(key, val);
  }
  const qs = sp.toString();
  return qs ? `/admin/prospects?${qs}` : '/admin/prospects';
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
