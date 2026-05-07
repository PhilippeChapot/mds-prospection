import { ShoppingCart, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { findPriceDivergences } from '@/lib/sellsy/sync-products';
import { SellsyProductsTable } from './SellsyProductsTable';
import { ResyncButton } from './ResyncButton';

export const metadata = { title: 'Catalogue Sellsy' };

interface MirrorRow {
  sellsy_item_id: number;
  reference: string;
  name: string | null;
  description: string | null;
  price_excl_tax: number | null;
  is_archived: boolean;
  synced_at: string;
}

export default async function SellsyProductsPage() {
  await requireAdminProfile();
  const supabase = await createSupabaseServerClient();

  const { data: itemsRaw, error } = await supabase
    .from('sellsy_products_mirror')
    .select('sellsy_item_id, reference, name, description, price_excl_tax, is_archived, synced_at')
    .order('reference', { ascending: true });

  if (error) {
    console.error('[admin/sellsy-products] fetch error:', error);
  }

  const items: MirrorRow[] = (itemsRaw ?? []) as MirrorRow[];
  const lastSync =
    items.length > 0
      ? items
          .map((i) => i.synced_at)
          .sort()
          .reverse()[0]
      : null;

  const divergences = await findPriceDivergences();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
            <ShoppingCart className="size-6" aria-hidden /> Catalogue Sellsy — Miroir local
          </h1>
          <p className="text-md-text-muted mt-1 text-sm">
            Synchronisé quotidiennement à 6h UTC.{' '}
            {lastSync ? (
              <>
                Dernière sync : <strong className="text-md-text">{formatDate(lastSync)}</strong>
              </>
            ) : (
              <em className="text-md-warning">Mirror vide — lancez une re-sync.</em>
            )}
          </p>
        </div>
        <ResyncButton />
      </header>

      <DivergencesSection divergences={divergences} />

      <SellsyProductsTable items={items} />
    </div>
  );
}

function DivergencesSection({
  divergences,
}: {
  divergences: Awaited<ReturnType<typeof findPriceDivergences>>;
}) {
  if (divergences.length === 0) {
    return (
      <div className="border-md-success/30 bg-md-success/5 rounded-md border p-3 text-sm">
        <div className="text-md-success flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden />
          <span className="font-semibold">Aucune divergence détectée</span>
        </div>
        <p className="text-md-text-muted mt-0.5 text-xs">
          Tous les prix DB (pricing_tiers + addon_options) sont alignés sur le catalogue Sellsy
          (tolérance 0.01 €).
        </p>
      </div>
    );
  }

  return (
    <div className="border-md-warning/40 bg-md-warning/5 rounded-md border p-4">
      <div className="text-md-warning mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4" aria-hidden />
        <span className="font-semibold">
          {divergences.length} divergence{divergences.length > 1 ? 's' : ''} de prix détectée
          {divergences.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-md-border text-md-text-muted border-b text-left text-xs tracking-wide uppercase">
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2 text-right">Prix DB</th>
              <th className="px-2 py-2 text-right">Prix Sellsy</th>
              <th className="px-2 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {divergences.map((d) => {
              const delta = d.priceSellsyHt - d.priceDbHt;
              return (
                <tr
                  key={`${d.source}-${d.rowId}`}
                  className="border-md-border/50 border-b last:border-0"
                >
                  <td className="text-md-text-muted px-2 py-2">
                    {d.source === 'pricing_tier' ? 'Pack' : 'Addon'}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{d.reference ?? '—'}</td>
                  <td className="px-2 py-2">{d.rowLabel}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatEur(d.priceDbHt)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {formatEur(d.priceSellsyHt)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      delta >= 0 ? 'text-md-success' : 'text-md-danger'
                    }`}
                  >
                    {delta >= 0 ? '+' : ''}
                    {formatEur(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-md-text-muted mt-3 text-xs">
        L&apos;alignement DB sur Sellsy se fait via SQL :{' '}
        <code className="bg-md-bg rounded px-1 py-0.5 font-mono">
          UPDATE pricing_tiers SET price_eur_ht = ... WHERE id = &apos;...&apos;;
        </code>
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}
