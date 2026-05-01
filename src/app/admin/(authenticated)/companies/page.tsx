import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PoleBadge } from '@/components/admin/PoleBadge';
import { CompanyAvatar } from '@/components/admin/CompanyAvatar';
import { POLE_CODES, type PoleCode } from '@/lib/design-tokens';
import type { Database } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

type CategoryTarif = Database['public']['Enums']['category_tarif'];

const CATEGORY_VALUES: CategoryTarif[] = ['prs_exhibitor', 'standard', 'non_eligible'];

export const metadata = { title: 'Societes' };

type SearchParams = Promise<{ pole?: string; category?: string }>;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Toutes',
  prs_exhibitor: 'PRS exposant',
  standard: 'Standard',
  non_eligible: 'Non eligible',
};

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

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const poleFilter: PoleCode | '' =
    params.pole && POLE_CODES.includes(params.pole as PoleCode) ? (params.pole as PoleCode) : '';
  const categoryFilter: CategoryTarif | '' =
    params.category && CATEGORY_VALUES.includes(params.category as CategoryTarif)
      ? (params.category as CategoryTarif)
      : '';

  const supabase = await createSupabaseServerClient();

  // Sanity check : COUNT(*) total companies (M3.4 — confirme que le seed P0 est bien en DB)
  const { count: totalCount } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true });
  console.log('[admin/companies] sanity COUNT(*) public.companies =', totalCount);

  // Resolve pole_id from pole_code if filter provided
  let poleIdFilter: string | null = null;
  if (poleFilter) {
    const { data: poleRow } = await supabase
      .from('poles')
      .select('id')
      .eq('code', poleFilter)
      .maybeSingle();
    poleIdFilter = poleRow?.id ?? null;
  }

  let query = supabase
    .from('companies')
    .select(
      'id, name, primary_domain, country, category, was_prs_2026_exhibitor, created_at, pole:poles(code, name_fr)',
    )
    .order('name', { ascending: true });

  if (poleIdFilter) query = query.eq('pole_id', poleIdFilter);
  if (categoryFilter) query = query.eq('category', categoryFilter);

  const { data: companies, error } = await query;
  if (error) {
    console.error('[admin/companies] fetch error:', error);
  }
  const rows = companies ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            Societes · {rows.length}
          </h1>
          <p className="text-md-text-muted text-sm">
            Donnees reelles depuis Supabase (table <code className="text-xs">public.companies</code>
            ) · total en base : <strong>{totalCount ?? '?'}</strong> societes.
          </p>
        </div>
      </div>

      {/* Filtres URL — server-side */}
      <form className="bg-card border-md-border flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-md-text-muted font-semibold tracking-wider uppercase">Pole</span>
          <select
            name="pole"
            defaultValue={poleFilter}
            className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="">Tous</option>
            {POLE_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-md-text-muted font-semibold tracking-wider uppercase">
            Categorie
          </span>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="border-md-border rounded-md border bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="">Toutes</option>
            <option value="prs_exhibitor">PRS exposant</option>
            <option value="standard">Standard</option>
            <option value="non_eligible">Non eligible</option>
          </select>
        </label>

        <button
          type="submit"
          className="bg-md-blue text-md-blue-foreground rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>

        {(poleFilter || categoryFilter) && (
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
                <th className="px-4 py-3">Pays</th>
                <th className="px-4 py-3">Domaine</th>
                <th className="px-4 py-3">Categorie</th>
                <th className="px-4 py-3">Date import</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-md-text-muted px-4 py-12 text-center text-sm">
                    Aucune societe ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  // Supabase rend la relation `pole` soit comme objet, soit comme tableau
                  // selon la cardinalite inferee. On normalise en objet ou null.
                  const rawPole = row.pole as
                    | { code: PoleCode; name_fr: string }
                    | { code: PoleCode; name_fr: string }[]
                    | null;
                  const pole = Array.isArray(rawPole) ? (rawPole[0] ?? null) : rawPole;
                  return (
                    <tr key={row.id} className="border-md-border hover:bg-muted/30 border-t">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/companies/${row.id}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <CompanyAvatar initials={initialsOf(row.name)} />
                          <div className="min-w-0">
                            <div className="text-md-text truncate font-semibold">{row.name}</div>
                            {row.was_prs_2026_exhibitor ? (
                              <div className="text-md-magenta text-[10px] font-bold tracking-wider uppercase">
                                Exposant PRS 2026
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {pole ? (
                          <PoleBadge code={pole.code} />
                        ) : (
                          <span className="text-md-text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="text-md-text px-4 py-3 text-xs">
                        {row.country ?? <span className="text-md-text-muted">—</span>}
                      </td>
                      <td className="text-md-text px-4 py-3 font-mono text-xs">
                        {row.primary_domain ?? <span className="text-md-text-muted">—</span>}
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
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </span>
                      </td>
                      <td className="text-md-text-muted px-4 py-3 text-xs">
                        {formatDate(row.created_at)}
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
