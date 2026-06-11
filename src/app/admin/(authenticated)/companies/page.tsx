import Link from 'next/link';
import { ArrowUpRight, Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { ExternalEventBadges } from '@/components/admin/ExternalEventBadges';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import { listCompaniesPaginated, listDistinctCountries } from '@/lib/supabase/queries';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { searchCompaniesFuzzy } from '@/lib/admin/search/fuzzy-search';
import { SearchSuggestions } from '@/components/admin/SearchSuggestions';
import type { Database } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';
import { CompaniesExportButton } from './CompaniesExportButton';

export const metadata = { title: 'Societes' };

type CategoryTarif = Database['public']['Enums']['category_tarif'];

const CATEGORY_VALUES: CategoryTarif[] = ['prs_exhibitor', 'standard', 'non_eligible'];

const CATEGORY_LABELS: Record<CategoryTarif, string> = {
  prs_exhibitor: 'PRS partenaire',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

const PER_PAGE = 50;

type SearchParams = Promise<{
  q?: string;
  pole?: string;
  category?: string;
  country?: string;
  /** P5.x.CompaniesAddressAndTags : 'missing' | 'complete' | undefined. */
  address?: string;
  /** P5.x.ProspectionIndicators : '1' pour masquer les sociétés déjà prospectées. */
  hideProspected?: string;
  page?: string;
}>;

function initialsOf(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDate(input: string | null): string {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return input.slice(0, 10);
  }
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/companies?${qs}` : '/admin/companies';
}

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminProfile();
  const params = await searchParams;

  const q = params.q?.trim() ?? '';
  const poleFilter: PoleCode | '' =
    params.pole && POLE_CODES.includes(params.pole as PoleCode) ? (params.pole as PoleCode) : '';
  const categoryFilter: CategoryTarif | '' =
    params.category && CATEGORY_VALUES.includes(params.category as CategoryTarif)
      ? (params.category as CategoryTarif)
      : '';
  const countryFilter = params.country?.trim().toUpperCase() ?? '';
  const addressFilter: 'missing' | 'complete' | '' =
    params.address === 'missing' ? 'missing' : params.address === 'complete' ? 'complete' : '';
  const hideProspected = params.hideProspected === '1';
  const page = Math.max(1, Number(params.page ?? '1'));

  const [{ rows, total }, countries, fuzzyResults] = await Promise.all([
    listCompaniesPaginated({
      q: q || undefined,
      poleCode: poleFilter || null,
      category: categoryFilter || null,
      country: countryFilter || null,
      missingAddress:
        addressFilter === 'missing' ? true : addressFilter === 'complete' ? false : null,
      hideProspected: hideProspected || null,
      page,
      perPage: PER_PAGE,
    }),
    listDistinctCountries(),
    q.length >= 2
      ? searchCompaniesFuzzy(q, { limitFuzzy: 5 })
      : Promise.resolve({ exact: [], suggestions: [], query: q }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = Boolean(
    q || poleFilter || categoryFilter || countryFilter || addressFilter || hideProspected,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Societes · {total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Donnees reelles depuis Supabase. Tu peux creer ou importer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CompaniesExportButton
            filters={{
              q: q || undefined,
              pole: poleFilter || undefined,
              category: categoryFilter || undefined,
              country: countryFilter || undefined,
            }}
          />
          <Button asChild variant="outline">
            <Link href="/admin/companies/import">
              <Upload className="size-4" aria-hidden />
              Importer CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/companies/new">
              <Plus className="size-4" aria-hidden />
              Nouvelle societe
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtres URL — server-side */}
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
            placeholder="Rechercher par nom, domaine ou ville…"
            className="pl-9"
          />
        </div>

        <select
          name="pole"
          defaultValue={poleFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous poles</option>
          {POLE_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select
          name="category"
          defaultValue={categoryFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Toutes categories</option>
          {CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <select
          name="country"
          defaultValue={countryFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Tous pays</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* P5.x.CompaniesAddressAndTags : filtre adresse */}
        <select
          name="address"
          defaultValue={addressFilter}
          className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Adresse : tous</option>
          <option value="missing">⚠ Adresse manquante</option>
          <option value="complete">✓ Adresse complète</option>
        </select>

        {/* P5.x.ProspectionIndicators */}
        <label className="text-md-text-muted inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            name="hideProspected"
            value="1"
            defaultChecked={hideProspected}
            className="size-3.5"
          />
          Masquer déjà prospectées
        </label>

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {hasFilters && (
          <Link
            href="/admin/companies"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Reinitialiser
          </Link>
        )}
      </form>

      <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Societe</th>
                <th className="px-4 py-3">Pole</th>
                <th className="px-4 py-3">Ville</th>
                <th className="px-4 py-3">CP</th>
                <th className="px-4 py-3">Pays</th>
                <th className="px-4 py-3">Categorie</th>
                <th className="px-4 py-3">Import</th>
                <th className="px-4 py-3">Prospecte</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-md-text-muted px-4 py-12 text-center text-sm">
                    Aucune societe ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/companies/${row.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <CompanyAvatar initials={initialsOf(row.name)} />
                        <div className="min-w-0">
                          <div className="text-md-text truncate font-semibold">{row.name}</div>
                          <ExternalEventBadges tags={row.external_event_tags} size="xs" />
                          {row.primary_domain ? (
                            <div className="text-md-text-muted truncate font-mono text-[10px]">
                              {row.primary_domain}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {row.pole ? (
                        <PoleBadge code={row.pole.code as PoleCode} />
                      ) : (
                        <span className="text-md-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.city ? (
                        <span className="text-md-text">{row.city}</span>
                      ) : (
                        <span className="bg-md-warning/15 text-md-warning rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                          ⚠ Manquant
                        </span>
                      )}
                    </td>
                    <td className="text-md-text-muted px-4 py-3 font-mono text-xs">
                      {row.postal_code ?? '—'}
                    </td>
                    <td className="text-md-text px-4 py-3 text-xs">
                      {row.country ?? <span className="text-md-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
                          row.category === 'prs_exhibitor'
                            ? 'bg-md-magenta/10 text-md-magenta'
                            : row.category === 'standard'
                              ? 'bg-md-blue/10 text-md-blue'
                              : 'bg-muted text-md-text-muted',
                        )}
                      >
                        {CATEGORY_LABELS[row.category]}
                      </span>
                    </td>
                    <td className="text-md-text-muted px-4 py-3 text-xs">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.has_prospected_contact ? (
                        <span className="font-semibold whitespace-nowrap text-emerald-700">
                          ✓ Prospecte
                        </span>
                      ) : (
                        <span className="font-semibold whitespace-nowrap text-amber-600">
                          ⚠ A prospecter
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/companies/${row.id}`}
                        className="text-md-blue inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      >
                        Voir
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {fuzzyResults.suggestions.length > 0 ? (
        <SearchSuggestions suggestions={fuzzyResults.suggestions} />
      ) : null}

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
