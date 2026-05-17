'use client';

/**
 * P6.x.5 / P6.x.5-ter — Devis Builder sur la fiche prospect.
 *
 * P6.x.5-ter : la remise est par ligne (chaque QuoteItem porte son
 * discount_pct). La section "Tarif préférentiel" globale est supprimée.
 * Le champ "Note interne / Justification" reste comme champ standalone.
 *
 * 3 sections :
 *   1. ProductPickerInline — sélection produits + qty + remise % par ligne
 *      (input désactivé sur PREMIUM, forcé à 0)
 *   2. Note interne / Justification — transmise à Sellsy en intro
 *   3. QuoteRecap — sous-total, remises cumulées, HT, TVA, TTC
 *
 * Actions :
 *   - Sauver brouillon → saveQuoteDraftAction
 *   - Émettre devis Sellsy → emitSellsyDevisFromQuoteBuilderAction
 *     (envoie row.discount = { unit:'percent', value } par ligne)
 */

import { useMemo, useState, useTransition } from 'react';
import { ChevronsUpDown, Loader2, Plus, Trash2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  calculateQuoteTotals,
  clampDiscountForItem,
  formatEurFr,
  type QuoteItem,
} from '@/lib/admin/prospects/quote-calc';
import { type AdminCatalogProduct, catalogProductToQuoteItem } from '@/lib/admin/prospects/catalog';
import {
  saveQuoteDraftAction,
  emitSellsyDevisFromQuoteBuilderAction,
} from '@/lib/admin/prospects/quote-builder-actions';

const VAT_RATE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  pack: '📦 Pack',
  option: '🔌 Option',
  sponsor: '⭐ Sponsoring',
  service: '🛎️ Service',
};

export interface QuoteBuilderProps {
  prospectId: string;
  initialItems: QuoteItem[];
  initialPromoReason: string | null;
  catalog: AdminCatalogProduct[];
  alreadyEmitted: boolean;
}

export function QuoteBuilder(props: QuoteBuilderProps) {
  const [items, setItems] = useState<QuoteItem[]>(props.initialItems);
  const [promoReason, setPromoReason] = useState<string>(props.initialPromoReason ?? '');
  const [, startTx] = useTransition();
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState(false);

  const totals = useMemo(() => calculateQuoteTotals(items, VAT_RATE), [items]);

  function addProduct(product: AdminCatalogProduct) {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.sellsy_product_id === product.sellsy_product_id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], qty: Math.min(99, next[existing].qty + 1) };
        return next;
      }
      return [...prev, catalogProductToQuoteItem(product, 1)];
    });
  }
  function removeItem(sellsyId: number) {
    setItems((prev) => prev.filter((i) => i.sellsy_product_id !== sellsyId));
  }
  function setQty(sellsyId: number, qty: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.sellsy_product_id === sellsyId
          ? { ...i, qty: Math.max(1, Math.min(99, Math.round(qty) || 1)) }
          : i,
      ),
    );
  }
  function setDiscount(sellsyId: number, pct: number) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.sellsy_product_id !== sellsyId) return i;
        // PREMIUM toujours 0 — l'UI désactive l'input mais on défend ici aussi
        if (i.is_premium) return { ...i, discount_pct: 0 };
        return { ...i, discount_pct: Math.max(0, Math.min(100, Number(pct) || 0)) };
      }),
    );
  }

  function handleSave() {
    setSaving(true);
    startTx(async () => {
      const r = await saveQuoteDraftAction({
        prospect_id: props.prospectId,
        quote_items: items,
        promo_reason: promoReason.trim() || null,
      });
      setSaving(false);
      if (r.ok) {
        toast.success(`Brouillon sauvé — Total HT ${formatEurFr(r.total_ht)}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleEmit() {
    if (items.length === 0) {
      toast.error('Sélectionnez au moins 1 produit.');
      return;
    }
    setEmitting(true);
    startTx(async () => {
      const saved = await saveQuoteDraftAction({
        prospect_id: props.prospectId,
        quote_items: items,
        promo_reason: promoReason.trim() || null,
      });
      if (!saved.ok) {
        setEmitting(false);
        toast.error(`Save échec : ${saved.error}`);
        return;
      }
      const r = await emitSellsyDevisFromQuoteBuilderAction({ prospect_id: props.prospectId });
      setEmitting(false);
      if (r.ok) {
        toast.success(
          `Devis émis ${r.sellsy_devis_number ?? ''} — Total HT ${formatEurFr(r.total_ht)}`,
        );
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="bg-card border-md-border space-y-5 rounded-xl border p-5 shadow-sm">
      <header>
        <h2 className="text-md-blue-dark text-sm font-bold tracking-wide uppercase">
          💰 Devis Builder
        </h2>
        <p className="text-md-text-muted mt-1 text-xs">
          Sélectionne les produits, applique une remise libre par ligne (PREMIUM est verrouillé à
          0%), puis émets le devis Sellsy.
        </p>
        {props.alreadyEmitted ? (
          <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
            ⚠️ Un devis Sellsy a déjà été émis. Une nouvelle émission créera un second document.
          </p>
        ) : null}
      </header>

      <ProductPickerInline
        items={items}
        catalog={props.catalog}
        onAdd={addProduct}
        onRemove={removeItem}
        onSetQty={setQty}
        onSetDiscount={setDiscount}
      />

      <div className="space-y-2">
        <Label
          htmlFor="promo_reason"
          className="text-md-blue-dark text-xs font-bold tracking-wide uppercase"
        >
          Note interne / Justification du devis
        </Label>
        <Textarea
          id="promo_reason"
          rows={2}
          placeholder="ex. Tarif Institutionnel UDECAM — sera transmise en intro du devis Sellsy"
          value={promoReason}
          onChange={(e) => setPromoReason(e.target.value)}
        />
      </div>

      <QuoteRecap items={items} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={handleSave} disabled={saving || emitting}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Sauver brouillon
        </Button>
        <Button
          type="button"
          onClick={handleEmit}
          disabled={emitting || saving || items.length === 0}
          className="bg-md-magenta hover:bg-md-magenta/90"
        >
          {emitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Émettre devis Sellsy
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProductPickerInline
// ---------------------------------------------------------------------------

function ProductPickerInline({
  items,
  catalog,
  onAdd,
  onRemove,
  onSetQty,
  onSetDiscount,
}: {
  items: QuoteItem[];
  catalog: AdminCatalogProduct[];
  onAdd: (p: AdminCatalogProduct) => void;
  onRemove: (sellsyId: number) => void;
  onSetQty: (sellsyId: number, qty: number) => void;
  onSetDiscount: (sellsyId: number, pct: number) => void;
}) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<string, AdminCatalogProduct[]> = {
      pack: [],
      option: [],
      sponsor: [],
      service: [],
    };
    for (const p of catalog) g[p.category]?.push(p);
    return g;
  }, [catalog]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
          Produits sélectionnés ({items.length})
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Plus className="size-3.5" aria-hidden /> Ajouter un produit
              <ChevronsUpDown className="ml-1 size-3" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Rechercher un produit…" />
              <CommandList>
                <CommandEmpty>Aucun produit trouvé.</CommandEmpty>
                {(['pack', 'option', 'sponsor', 'service'] as const).map((cat) =>
                  grouped[cat] && grouped[cat].length > 0 ? (
                    <CommandGroup key={cat} heading={CATEGORY_LABEL[cat]}>
                      {grouped[cat].map((p) => (
                        <CommandItem
                          key={p.sellsy_product_id}
                          value={`${p.reference} ${p.name} ${p.editorial_title ?? ''}`}
                          onSelect={() => {
                            onAdd(p);
                            setOpen(false);
                          }}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-md-text truncate text-sm">
                                {p.editorial_title || p.name}
                                {p.is_premium ? (
                                  <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                                    PREMIUM
                                  </span>
                                ) : null}
                                {!p.is_visible_public ? (
                                  <span className="ml-1.5 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold text-slate-700">
                                    interne
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-md-text-muted text-[10px]">{p.reference}</div>
                            </div>
                            <span className="text-md-blue-deep shrink-0 text-xs font-bold tabular-nums">
                              {formatEurFr(p.unit_price_ht)}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null,
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {items.length === 0 ? (
        <div className="border-md-border text-md-text-muted bg-muted/30 rounded-md border border-dashed p-4 text-center text-xs">
          Aucun produit. Cliquez « Ajouter un produit » pour démarrer.
        </div>
      ) : (
        <ul className="border-md-border divide-md-border divide-y rounded-md border bg-white text-sm">
          {items.map((it) => (
            <ItemRow
              key={it.sellsy_product_id}
              item={it}
              onRemove={onRemove}
              onSetQty={onSetQty}
              onSetDiscount={onSetDiscount}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onRemove,
  onSetQty,
  onSetDiscount,
}: {
  item: QuoteItem;
  onRemove: (sellsyId: number) => void;
  onSetQty: (sellsyId: number, qty: number) => void;
  onSetDiscount: (sellsyId: number, pct: number) => void;
}) {
  const lineHt = item.unit_price_ht * item.qty;
  const pct = clampDiscountForItem(item);
  const lineNet = lineHt * (1 - pct / 100);
  return (
    <li className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
      <div className="min-w-0">
        <div className="text-md-text flex items-center gap-2 font-semibold">
          <span className="truncate">{item.name}</span>
          {item.is_premium ? (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
              PREMIUM
            </span>
          ) : null}
        </div>
        <div className="text-md-text-muted text-[10px]">
          {CATEGORY_LABEL[item.category] ?? item.category} · {item.reference} ·{' '}
          {formatEurFr(item.unit_price_ht)} HT
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Label htmlFor={`qty-${item.sellsy_product_id}`} className="sr-only">
          Quantité
        </Label>
        <Input
          id={`qty-${item.sellsy_product_id}`}
          type="number"
          min={1}
          max={99}
          value={item.qty}
          onChange={(e) => onSetQty(item.sellsy_product_id, Number(e.target.value))}
          className="w-14 text-center"
        />
      </div>
      <div className="flex items-center gap-1">
        <Label htmlFor={`disc-${item.sellsy_product_id}`} className="sr-only">
          Remise %
        </Label>
        <Input
          id={`disc-${item.sellsy_product_id}`}
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={item.is_premium ? 0 : (item.discount_pct ?? 0)}
          onChange={(e) => onSetDiscount(item.sellsy_product_id, Number(e.target.value))}
          disabled={item.is_premium}
          title={
            item.is_premium
              ? 'Pas de remise possible sur PREMIUM'
              : 'Remise % appliquée à cette ligne'
          }
          className="w-16 text-center"
        />
        <span className="text-md-text-muted text-[10px]">%</span>
      </div>
      <div className="text-md-blue-deep text-right text-xs font-bold tabular-nums">
        {formatEurFr(lineNet)}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onRemove(item.sellsy_product_id)}
        aria-label={`Retirer ${item.name}`}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// QuoteRecap
// ---------------------------------------------------------------------------

function QuoteRecap({ items }: { items: QuoteItem[] }) {
  const totals = calculateQuoteTotals(items, VAT_RATE);
  const showDiscount = totals.discount_amount > 0;
  return (
    <div className="border-md-border bg-muted/20 rounded-md border p-4">
      <Label className="text-md-blue-dark mb-2 inline-block text-xs font-bold tracking-wide uppercase">
        Récap
      </Label>
      <dl className="text-md-text grid gap-1 text-sm">
        <Row label="Sous-total HT" value={formatEurFr(totals.subtotal_ht)} />
        {showDiscount ? (
          <Row
            label="Remises cumulées"
            value={`- ${formatEurFr(totals.discount_amount)}`}
            accent="magenta"
          />
        ) : null}
        <Row label="Total HT" value={formatEurFr(totals.total_ht)} strong />
        <Row label={`TVA (${VAT_RATE}%)`} value={formatEurFr(totals.vat_amount)} />
        <Row label="Total TTC" value={formatEurFr(totals.total_ttc)} strong accent="blue-deep" />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
  accent?: 'magenta' | 'blue-deep';
}) {
  const valClass = strong
    ? accent === 'blue-deep'
      ? 'text-md-blue-deep font-extrabold'
      : 'text-md-text font-extrabold'
    : accent === 'magenta'
      ? 'text-md-magenta font-semibold'
      : 'text-md-text';
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-md-text-muted text-xs">{label}</dt>
      <dd className={`text-sm tabular-nums ${valClass}`}>{value}</dd>
    </div>
  );
}
