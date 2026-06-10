import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Banknote, ExternalLink, Pencil, Search, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import {
  listProductsWithEditorial,
  getTarifsCounters,
  type ListProductsFilters,
} from '@/lib/tarifs/admin-queries';
import { TARIF_CATEGORIES, CATEGORY_LABELS, type TarifCategory } from '@/lib/tarifs/types';
import { formatEurHt } from '@/lib/tarifs/format';
import { CategoryBadge } from './_components/CategoryBadge';
import { InlineRowControls } from './_components/InlineRowControls';
import { EditorialSheet } from './_components/EditorialSheet';
import { BulkInitButton } from './_components/BulkInitButton';
import { AutoClassifyButton } from './_components/AutoClassifyButton';

export const metadata = { title: 'Tarifs' };

type SearchParams = Promise<{
  q?: string;
  cat?: string | string[];
  untagged?: string;
  featured?: string;
  archived?: string;
}>;

function parseCategories(raw: string | string[] | undefined): TarifCategory[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : raw.split(',');
  return arr.filter((c): c is TarifCategory => (TARIF_CATEGORIES as readonly string[]).includes(c));
}

export default async function TarifsPage({ searchParams }: { searchParams: SearchParams }) {
  // P5.x.1-quater (bug #2) — defense in depth : tarifs = admin+ only.
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  const params = await searchParams;

  const q = params.q?.trim() ?? '';
  const categories = parseCategories(params.cat);
  const untaggedOnly = params.untagged === '1';
  const featuredOnly = params.featured === '1';
  const includeArchived = params.archived === '1';

  const filters: ListProductsFilters = {
    q: q || null,
    categories: categories.length > 0 ? categories : null,
    untaggedOnly,
    featuredOnly,
    includeArchived,
  };

  const [rows, counters] = await Promise.all([
    listProductsWithEditorial(filters),
    getTarifsCounters(),
  ]);

  const hasFilters =
    Boolean(q) || categories.length > 0 || untaggedOnly || featuredOnly || includeArchived;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
            <Banknote className="size-6" aria-hidden /> Tarifs · {counters.total}
          </h1>
          <p className="text-md-text-muted text-sm">
            Couche éditoriale par-dessus le catalogue Sellsy. Sellsy = source de vérité des prix,
            ici on ajoute catégorie, ordre, contenu marketing. Sync miroir Sellsy via{' '}
            <Link href="/admin/sellsy-products" className="text-md-blue hover:underline">
              Catalogue Sellsy <ExternalLink className="inline size-3" aria-hidden />
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AutoClassifyButton />
          <BulkInitButton untagged={counters.untagged} />
        </div>
      </header>

      {/* P6.x.1a-quinquies — hint preffixe MDS-* (multi-business Sellsy) */}
      <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">💡 Ajout d&apos;un nouveau tarif</p>
        <p className="mt-1">
          Pour qu&apos;un produit Sellsy apparaisse ici, sa <strong>référence</strong> doit
          commencer par <code className="rounded bg-white px-1">MDS-</code> (ex&nbsp;:{' '}
          <code className="rounded bg-white px-1">MDS-PACK-STANDARD-PARIS</code>,{' '}
          <code className="rounded bg-white px-1">MDS-ADDON-LOGO-GOLD-PARIS</code>). La prochaine
          synchronisation avec Sellsy l&apos;importera automatiquement.
        </p>
        <p className="mt-1 text-xs italic opacity-80">
          For a Sellsy product to appear in this catalog, its reference must start with{' '}
          <code className="rounded bg-white px-1">MDS-</code>.
        </p>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sellsy actifs" value={counters.total} />
        <Stat label="Tagués" value={counters.tagged} tone="success" />
        <Stat
          label="Non tagués"
          value={counters.untagged}
          tone={counters.untagged > 0 ? 'warning' : 'default'}
        />
        <Stat label="Mis en avant" value={counters.featured} />
        <Stat label="Masqués public" value={counters.hiddenFromPublic} />
      </section>

      {/* Filtres */}
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
            placeholder="Nom Sellsy ou référence…"
            className="pl-9"
          />
        </div>

        <select
          name="cat"
          multiple
          defaultValue={categories}
          className="border-md-border h-9 min-w-[140px] rounded-md border bg-white px-2 text-xs"
          size={1}
        >
          {TARIF_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <label className="text-md-text inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="untagged" value="1" defaultChecked={untaggedOnly} />
          Non tagués
        </label>
        <label className="text-md-text inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="featured" value="1" defaultChecked={featuredOnly} />
          Featured
        </label>
        <label className="text-md-text inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          Inclure archivés
        </label>

        <button
          type="submit"
          className="bg-md-blue rounded-md px-3 py-1.5 text-xs font-semibold text-white"
        >
          Appliquer
        </button>
        {hasFilters ? (
          <Link
            href="/admin/tarifs"
            className="text-md-text-muted hover:text-md-text text-xs underline"
          >
            Réinitialiser
          </Link>
        ) : null}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-12 text-center text-sm shadow-sm">
          {counters.total === 0 ? (
            <>
              Aucun produit dans <code>sellsy_products_mirror</code>. Lance une sync via{' '}
              <Link href="/admin/sellsy-products" className="text-md-blue hover:underline">
                Catalogue Sellsy
              </Link>
              .
            </>
          ) : (
            <>Aucun produit ne correspond aux filtres.</>
          )}
        </div>
      ) : (
        <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2">Produit Sellsy</th>
                  <th className="px-3 py-2">Prix HT</th>
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Sous-cat</th>
                  <th className="px-3 py-2">Ordre</th>
                  <th className="px-3 py-2 text-center">★</th>
                  <th className="px-3 py-2 text-center">👁</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.sellsy.sellsy_item_id}
                    className="border-md-border hover:bg-muted/30 border-t"
                  >
                    <td className="px-3 py-2">
                      <div className="text-md-text font-medium">
                        {r.sellsy.name ?? <em>(sans nom)</em>}
                        {r.editorial?.featured ? (
                          <Star className="text-md-blue ml-1 inline-block size-3" aria-hidden />
                        ) : null}
                      </div>
                      <div className="text-md-text-muted font-mono text-[10px]">
                        #{r.sellsy.sellsy_item_id} · {r.sellsy.reference}
                        {r.sellsy.is_archived ? ' · archived' : ''}
                      </div>
                      {r.editorial?.editorial_title ? (
                        <div className="text-md-blue-dark mt-0.5 text-xs">
                          {r.editorial.editorial_title}
                        </div>
                      ) : null}
                      {r.editorial &&
                      !r.editorial.editorial_title &&
                      r.editorial.category !== 'autre' ? (
                        <div className="mt-1">
                          <CategoryBadge
                            category={r.editorial.category}
                            subCategory={r.editorial.sub_category}
                            size="xs"
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="text-md-text px-3 py-2 font-mono text-xs">
                      {formatEurHt(r.sellsy.price_excl_tax)}
                    </td>
                    <InlineRowControls row={r} />
                    <td className="px-3 py-2 text-right">
                      <EditorialSheet
                        row={r}
                        trigger={
                          <Button type="button" variant="outline" size="sm">
                            <Pencil className="size-3" aria-hidden />
                            Éditer
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneCls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-md-border bg-card';
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneCls}`}>
      <p className="text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-md-blue-deep font-display mt-1 text-xl font-extrabold tabular-nums">
        {value.toLocaleString('fr-FR')}
      </p>
    </div>
  );
}
