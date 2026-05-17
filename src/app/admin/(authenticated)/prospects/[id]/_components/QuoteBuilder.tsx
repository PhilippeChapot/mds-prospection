'use client';

/**
 * P6.x.5 — Devis Builder sur la fiche prospect.
 *
 * 3 sections :
 *   1. ProductPickerInline — sélection produits depuis le catalogue admin
 *   2. PromoConfig — % préférentiel libre 0-100 + justification + gate premium
 *   3. QuoteRecap — récap calculé live (sous-total, remise, HT, TVA, TTC)
 *
 * Actions :
 *   - "Sauver brouillon" → saveQuoteDraftAction
 *   - "Émettre devis Sellsy" → emitSellsyDevisFromQuoteBuilderAction
 *
 * Le calcul live et le calcul Sellsy partagent la même fonction pure
 * `calculateQuoteTotals` pour garantir l'égalité parfaite des totaux.
 */

import { useMemo, useState, useTransition } from 'react';
import { ChevronsUpDown, Loader2, Plus, Trash2, X, Save, Send } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  calculateQuoteTotals,
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
  initialPromoPct: number;
  initialPromoReason: string | null;
  initialExcludesPremium: boolean;
  catalog: AdminCatalogProduct[];
  alreadyEmitted: boolean;
}

export function QuoteBuilder(props: QuoteBuilderProps) {
  const [items, setItems] = useState<QuoteItem[]>(props.initialItems);
  const [promoPct, setPromoPct] = useState<number>(props.initialPromoPct);
  const [promoReason, setPromoReason] = useState<string>(props.initialPromoReason ?? '');
  const [excludesPremium, setExcludesPremium] = useState<boolean>(props.initialExcludesPremium);
  const [, startTx] = useTransition();
  const [saving, setSaving] = useState(false);
  const [emitting, setEmitting] = useState(false);

  const totals = useMemo(
    () => calculateQuoteTotals(items, promoPct, excludesPremium, VAT_RATE),
    [items, promoPct, excludesPremium],
  );

  function addProduct(product: AdminCatalogProduct) {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.sellsy_product_id === product.sellsy_product_id);
      if (existing >= 0) {
        // Si déjà présent, on incrémente qty
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

  function handleSave() {
    setSaving(true);
    startTx(async () => {
      const r = await saveQuoteDraftAction({
        prospect_id: props.prospectId,
        quote_items: items,
        promo_pct: promoPct,
        promo_reason: promoReason.trim() || null,
        promo_excludes_premium: excludesPremium,
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
      // On sauve d'abord pour éviter l'état "user a changé mais pas sauvé"
      const saved = await saveQuoteDraftAction({
        prospect_id: props.prospectId,
        quote_items: items,
        promo_pct: promoPct,
        promo_reason: promoReason.trim() || null,
        promo_excludes_premium: excludesPremium,
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
          Sélectionne les produits, applique un tarif préférentiel libre (0-100%), puis émets le
          devis Sellsy. La remise s’applique sur tous les items sauf PREMIUM (modifiable).
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
      />

      <PromoConfig
        pct={promoPct}
        reason={promoReason}
        excludesPremium={excludesPremium}
        onPctChange={setPromoPct}
        onReasonChange={setPromoReason}
        onExcludesChange={setExcludesPremium}
      />

      <QuoteRecap items={items} promoPct={promoPct} excludesPremium={excludesPremium} />

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
}: {
  items: QuoteItem[];
  catalog: AdminCatalogProduct[];
  onAdd: (p: AdminCatalogProduct) => void;
  onRemove: (sellsyId: number) => void;
  onSetQty: (sellsyId: number, qty: number) => void;
}) {
  const [open, setOpen] = useState(false);

  // On affiche TOUS les produits, y compris ceux déjà ajoutés (incrément qty).
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
            <li key={it.sellsy_product_id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-md-text flex items-center gap-2 font-semibold">
                  <span className="truncate">{it.name}</span>
                  {it.is_premium ? (
                    <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                      PREMIUM
                    </span>
                  ) : null}
                </div>
                <div className="text-md-text-muted text-[10px]">
                  {CATEGORY_LABEL[it.category] ?? it.category} · {it.reference}
                </div>
              </div>
              <span className="text-md-text-muted shrink-0 text-xs tabular-nums">
                {formatEurFr(it.unit_price_ht)}
              </span>
              <Input
                type="number"
                min={1}
                max={99}
                value={it.qty}
                onChange={(e) => onSetQty(it.sellsy_product_id, Number(e.target.value))}
                className="w-16 shrink-0 text-center"
                aria-label={`Quantité ${it.name}`}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onRemove(it.sellsy_product_id)}
                aria-label={`Retirer ${it.name}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromoConfig
// ---------------------------------------------------------------------------

function PromoConfig({
  pct,
  reason,
  excludesPremium,
  onPctChange,
  onReasonChange,
  onExcludesChange,
}: {
  pct: number;
  reason: string;
  excludesPremium: boolean;
  onPctChange: (n: number) => void;
  onReasonChange: (s: string) => void;
  onExcludesChange: (b: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-md-blue-dark text-xs font-bold tracking-wide uppercase">
        Tarif préférentiel
      </Label>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <Label htmlFor="promo_pct" className="text-md-text-muted text-[11px]">
            % de remise (0-100)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="promo_pct"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={pct}
              onChange={(e) => onPctChange(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-24 text-center"
            />
            <span className="text-md-text-muted text-xs">%</span>
          </div>
        </div>
        <div>
          <Label htmlFor="promo_reason" className="text-md-text-muted text-[11px]">
            Justification (visible dans le devis Sellsy)
          </Label>
          <Input
            id="promo_reason"
            type="text"
            placeholder="ex. Tarif Institutionnel UDECAM"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </div>
      </div>
      <label className="text-md-text inline-flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox checked={excludesPremium} onCheckedChange={(c) => onExcludesChange(Boolean(c))} />
        Exclure les produits PREMIUM de la remise
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuoteRecap
// ---------------------------------------------------------------------------

function QuoteRecap({
  items,
  promoPct,
  excludesPremium,
}: {
  items: QuoteItem[];
  promoPct: number;
  excludesPremium: boolean;
}) {
  const totals = calculateQuoteTotals(items, promoPct, excludesPremium, VAT_RATE);
  const showDiscount = promoPct > 0 && totals.discount_amount > 0;
  return (
    <div className="border-md-border bg-muted/20 rounded-md border p-4">
      <Label className="text-md-blue-dark mb-2 inline-block text-xs font-bold tracking-wide uppercase">
        Récap
      </Label>
      <dl className="text-md-text grid gap-1 text-sm">
        <Row label="Sous-total HT" value={formatEurFr(totals.subtotal_ht)} />
        {showDiscount ? (
          <>
            <Row
              label={
                <span className="inline-flex items-center gap-2">
                  Tarif préférentiel
                  <span className="bg-md-magenta rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                    -{promoPct}%
                  </span>
                  {excludesPremium ? (
                    <span className="text-md-text-muted text-[10px]">(hors PREMIUM)</span>
                  ) : null}
                </span>
              }
              value={`- ${formatEurFr(totals.discount_amount)}`}
              accent="magenta"
            />
            <Row label="Total HT" value={formatEurFr(totals.total_ht)} strong />
          </>
        ) : (
          <Row label="Total HT" value={formatEurFr(totals.total_ht)} strong />
        )}
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
