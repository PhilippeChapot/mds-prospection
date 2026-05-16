'use client';

/**
 * P6.x.1a-quater — bouton "Auto-classer (regex)" + modale preview.
 *
 * Flow :
 *   1. Clic → fetch dry_run avec override_existing=false → modale preview
 *   2. Modale : tableau preview + checkbox "override classifs manuelles"
 *   3. Si override changé → re-fetch dry_run pour recalculer skipped/classified
 *   4. Clic "Appliquer" → fetch dry_run=false avec override choisi → toast + refresh
 */

import { useState, useTransition, useEffect } from 'react';
import { Loader2, Sparkles, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { autoClassifyAllAction } from '@/lib/tarifs/admin-actions';
import type { AutoClassifyResult } from '@/lib/tarifs/admin-actions-schema';

const CONFIDENCE_BADGE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

export function AutoClassifyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [preview, setPreview] = useState<AutoClassifyResult | null>(null);
  const [pending, start] = useTransition();

  // Charge le dry_run au moment où on ouvre + quand override change
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    start(async () => {
      const result = await autoClassifyAllAction({
        override_existing: overrideExisting,
        dry_run: true,
      });
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.data ?? null);
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, overrideExisting]);

  function handleOpen() {
    setOverrideExisting(false);
    setPreview(null);
    setOpen(true);
  }

  function handleApply() {
    start(async () => {
      const result = await autoClassifyAllAction({
        override_existing: overrideExisting,
        dry_run: false,
      });
      if (result.ok) {
        const c = result.data?.classified ?? 0;
        const s = result.data?.skipped ?? 0;
        const u = result.data?.unmatched ?? 0;
        toast.success(`${c} produit(s) classifié(s) · ${s} skip · ${u} non-matchés`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={handleOpen} disabled={pending}>
        <Sparkles className="size-3.5" aria-hidden />
        Auto-classer (regex)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-4xl">
          <DialogHeader>
            <DialogTitle>Auto-classification par regex</DialogTitle>
            <DialogDescription>
              Classification déterministe basée sur le préfixe de la référence Sellsy. Phil peut
              ensuite ajuster manuellement chaque ligne via l&apos;éditeur.
            </DialogDescription>
          </DialogHeader>

          {pending && !preview ? (
            <div className="text-md-text-muted flex items-center gap-2 px-3 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Calcul du preview…
            </div>
          ) : preview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="À classifier" value={preview.classified} tone="success" />
                <Stat
                  label="Skip (déjà tagué)"
                  value={preview.skipped}
                  tone={preview.skipped > 0 ? 'warning' : 'default'}
                />
                <Stat
                  label="Non-matchés"
                  value={preview.unmatched}
                  tone={preview.unmatched > 0 ? 'warning' : 'default'}
                />
              </div>

              <label className="text-md-text inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overrideExisting}
                  onChange={(e) => setOverrideExisting(e.target.checked)}
                />
                Override les classifications manuelles existantes (catégorie ≠ autre)
              </label>

              {preview.preview.length > 0 ? (
                <div className="border-md-border max-h-[40vh] overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-md-text-muted text-[9px] font-semibold tracking-wider uppercase">
                      <tr>
                        <th className="px-2 py-1.5">Référence</th>
                        <th className="px-2 py-1.5">Avant</th>
                        <th className="px-2 py-1.5">→</th>
                        <th className="px-2 py-1.5">Après</th>
                        <th className="px-2 py-1.5">Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((p) => (
                        <tr key={p.sellsy_product_id} className="border-md-border border-t">
                          <td className="px-2 py-1.5">
                            <div className="text-md-text font-mono text-[10px]">{p.reference}</div>
                            {p.name ? (
                              <div className="text-md-text-muted text-[9px]">{p.name}</div>
                            ) : null}
                          </td>
                          <td className="text-md-text-muted px-2 py-1.5 text-[10px]">
                            {p.current_category ? (
                              <>
                                {p.current_category}
                                {p.current_sub_category ? ` / ${p.current_sub_category}` : ''}
                              </>
                            ) : (
                              <span className="italic">(rien)</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <ArrowRight className="size-3" aria-hidden />
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="text-md-text font-medium">{p.new_category}</span>
                            {p.new_sub_category ? (
                              <span className="text-md-text-muted">
                                {' / '}
                                {p.new_sub_category}
                              </span>
                            ) : null}
                            <div className="text-md-text-muted text-[9px]">{p.label}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CONFIDENCE_BADGE[p.confidence]}`}
                            >
                              {p.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-md-text-muted px-3 py-4 text-center text-xs">
                  Rien à classifier avec ces options.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={pending || !preview || preview.classified === 0}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Appliquer ({preview?.classified ?? 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'warning';
}) {
  const toneCls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-md-border bg-card';
  return (
    <div className={`rounded-md border p-2 text-center ${toneCls}`}>
      <p className="text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-md-blue-deep mt-0.5 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
