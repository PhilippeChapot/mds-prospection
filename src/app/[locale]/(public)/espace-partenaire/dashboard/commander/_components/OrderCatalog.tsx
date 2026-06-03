'use client';

/**
 * P6.x.1b — UI catalogue commandable + cart + checkout.
 *
 * - Catalogue groupé par catégorie (sponsor, option, service)
 * - Cart : Map<sellsy_product_id, qty> en state
 * - Sticky bar bottom : N items + total HT + total TTC + bouton "Payer"
 * - Click "Payer" → server action → redirect vers Stripe Checkout URL
 */

import { useMemo, useState, useTransition } from 'react';
import { Loader2, Plus, Minus, ShoppingCart, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createSupplementaryCheckoutSession } from '@/lib/espace-partenaire/supplementary-orders/actions';
import type { OrderableProduct } from '@/lib/espace-partenaire/supplementary-orders/queries';
import { formatEurHt } from '@/lib/tarifs/format';

const VAT_RATE = 20;
const MAX_QTY = 10;

const CATEGORY_LABELS: Record<'sponsor' | 'option' | 'service', { title: string; intro: string }> =
  {
    sponsor: {
      title: 'Sponsorings',
      intro: 'Augmentez votre visibilité avec un sponsoring dédié.',
    },
    option: {
      title: 'Options à la carte',
      intro: 'Équipement, connectivité, signalétique : personnalisez votre stand.',
    },
    service: {
      title: 'Services additionnels',
      intro: 'Animations, restauration, mises en relation.',
    },
  };

interface CartState {
  [sellsyProductId: number]: number;
}

function formatEurTtc(value: number): string {
  return formatEurHt(value).replace('HT', 'TTC');
}

export function OrderCatalog({ catalog }: { catalog: OrderableProduct[] }) {
  const [cart, setCart] = useState<CartState>({});
  const [pending, start] = useTransition();

  const byCategory = useMemo(() => {
    const groups: Record<'sponsor' | 'option' | 'service', OrderableProduct[]> = {
      sponsor: [],
      option: [],
      service: [],
    };
    for (const p of catalog) {
      if (p.category === 'sponsor' || p.category === 'option' || p.category === 'service') {
        groups[p.category].push(p);
      }
    }
    return groups;
  }, [catalog]);

  const productsById = useMemo(() => {
    const m = new Map<number, OrderableProduct>();
    for (const p of catalog) m.set(p.sellsy_product_id, p);
    return m;
  }, [catalog]);

  const { itemCount, totalHt, totalTtc } = useMemo(() => {
    let count = 0;
    let ht = 0;
    for (const [idStr, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const p = productsById.get(Number(idStr));
      if (!p) continue;
      count += qty;
      ht += p.unit_price_ht * qty;
    }
    return {
      itemCount: count,
      totalHt: Math.round(ht * 100) / 100,
      totalTtc: Math.round(ht * (1 + VAT_RATE / 100) * 100) / 100,
    };
  }, [cart, productsById]);

  function setQty(sellsyProductId: number, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[sellsyProductId];
      } else {
        next[sellsyProductId] = Math.min(qty, MAX_QTY);
      }
      return next;
    });
  }

  function handleCheckout() {
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ sellsy_product_id: Number(id), qty }));
    if (items.length === 0) {
      toast.error('Panier vide.');
      return;
    }
    start(async () => {
      const result = await createSupplementaryCheckoutSession({ items });
      if (result.ok) {
        window.location.href = result.url;
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="space-y-10 pb-32">
        {(['sponsor', 'option', 'service'] as const).map((cat) => {
          const items = byCategory[cat];
          if (items.length === 0) return null;
          const label = CATEGORY_LABELS[cat];
          return (
            <section key={cat}>
              <h2 className="text-md-blue-dark text-xl font-bold">{label.title}</h2>
              <p className="text-md-text-muted mb-4 text-sm">{label.intro}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => (
                  <ProductCard
                    key={p.sellsy_product_id}
                    product={p}
                    qty={cart[p.sellsy_product_id] ?? 0}
                    onChange={(q) => setQty(p.sellsy_product_id, q)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {catalog.length === 0 ? (
          <p className="text-md-text-muted text-center text-sm">
            Aucun produit commandable pour le moment.
          </p>
        ) : null}
      </div>

      {itemCount > 0 ? (
        <div className="border-md-border fixed right-0 bottom-0 left-0 z-40 border-t bg-white px-4 py-3 shadow-lg sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="text-md-text flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4" aria-hidden />
              <span className="font-semibold">
                {itemCount} produit{itemCount > 1 ? 's' : ''}
              </span>
              <span className="text-md-text-muted">·</span>
              <span>{formatEurHt(totalHt)}</span>
              <span className="text-md-text-muted">·</span>
              <span className="text-md-blue-deep font-bold">{formatEurTtc(totalTtc)}</span>
            </div>
            <Button
              type="button"
              onClick={handleCheckout}
              disabled={pending}
              className="bg-md-magenta hover:bg-md-magenta/90"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShoppingCart className="size-4" aria-hidden />
              )}
              {pending ? 'Redirection…' : `Payer ${formatEurTtc(totalTtc)}`}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ProductCard({
  product,
  qty,
  onChange,
}: {
  product: OrderableProduct;
  qty: number;
  onChange: (qty: number) => void;
}) {
  const title = product.editorial_title || product.name;
  return (
    <div
      className={`border-md-border bg-card flex flex-col rounded-xl border p-4 shadow-sm ${qty > 0 ? 'ring-md-magenta/40 ring-2' : ''}`}
    >
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt={title}
          className="border-md-border mb-3 h-32 w-full rounded-md border object-cover"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-md-text text-sm font-semibold">{title}</h3>
        {product.featured ? (
          <Star className="text-md-magenta size-3.5 shrink-0" aria-label="featured" />
        ) : null}
      </div>
      {product.tagline ? (
        <p className="text-md-text-muted mt-1 text-xs">{product.tagline}</p>
      ) : null}
      {product.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {product.tags.map((t) => (
            <span
              key={t}
              className="bg-md-blue/10 text-md-blue rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div className="text-md-blue-deep mt-3 text-lg font-extrabold tabular-nums">
        {formatEurHt(product.unit_price_ht)}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {qty === 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onChange(1)}
          >
            <Plus className="size-3.5" aria-hidden />
            Ajouter
          </Button>
        ) : (
          <div className="border-md-border flex w-full items-center justify-between rounded-md border">
            <button
              type="button"
              onClick={() => onChange(qty - 1)}
              className="hover:bg-muted/50 rounded-l-md p-2"
              aria-label="Diminuer"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="text-md-text px-2 text-sm font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => onChange(qty + 1)}
              disabled={qty >= MAX_QTY}
              className="hover:bg-muted/50 rounded-r-md p-2 disabled:opacity-50"
              aria-label="Augmenter"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
