'use client';

/**
 * P5.x.CompanyMerge — bouton + dialog de fusion (super_admin only).
 *
 * Flow : la société courante = la SOURCE (sera supprimée). On cherche la
 * CIBLE (gardée), on prévisualise l'impact, on tape "FUSIONNER" pour
 * confirmer. Au succès → redirect vers la fiche cible (la source n'existe
 * plus).
 *
 * Doctrine [[feedback_check_use_client_before_event_handlers]] : 'use
 * client' obligatoire — onClick / onChange / useState.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { GitMerge, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  searchMergeTargetsAction,
  previewMergeImpactAction,
  mergeCompaniesAction,
  type MergeTargetLite,
  type MergeImpact,
} from '@/lib/admin/companies/merge-actions';

export function MergeCompanyButton({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Recherche cible
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MergeTargetLite[]>([]);
  const [searching, setSearching] = useState(false);

  // Cible sélectionnée + impact
  const [target, setTarget] = useState<MergeTargetLite | null>(null);
  const [impact, setImpact] = useState<MergeImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // Confirmation
  const [confirmation, setConfirmation] = useState('');
  const [pending, startTx] = useTransition();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Reset complet à la fermeture.
  function resetAll() {
    setQuery('');
    setResults([]);
    setTarget(null);
    setImpact(null);
    setConfirmation('');
  }

  // Debounce de la recherche cible (250ms). Pattern aligné sur
  // SellsyClientSearchPicker (setState dans l'effet = cas légitime).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (target) return; // une cible est choisie, plus de recherche
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchMergeTargetsAction({ q: query.trim(), exclude_id: sourceId });
      setResults(r);
      setSearching(false);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, target, sourceId]);

  // Charge l'impact quand une cible est choisie.
  async function selectTarget(t: MergeTargetLite) {
    setTarget(t);
    setResults([]);
    setLoadingImpact(true);
    const r = await previewMergeImpactAction({ source_id: sourceId, target_id: t.id });
    setLoadingImpact(false);
    if (!r.ok) {
      toast.error(r.error);
      setTarget(null);
      return;
    }
    setImpact(r.data);
  }

  function handleMerge() {
    if (!target) return;
    startTx(async () => {
      const r = await mergeCompaniesAction({
        source_id: sourceId,
        target_id: target.id,
        confirmation: 'FUSIONNER',
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`« ${sourceName} » fusionnée dans « ${r.data.target_name} ».`);
      setOpen(false);
      resetAll();
      router.push(`/admin/companies/${target.id}`);
      router.refresh();
    });
  }

  const canMerge = !pending && !!target && !!impact && confirmation === 'FUSIONNER';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <GitMerge className="size-4" aria-hidden />
          Fusionner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fusionner cette société</DialogTitle>
          <DialogDescription>
            <strong className="text-md-danger">« {sourceName} » sera supprimée</strong> et toutes
            ses données (prospects, contacts, notes, calendrier, historique) déplacées vers la
            société cible que vous choisissez. Action <strong>irréversible</strong>.
          </DialogDescription>
        </DialogHeader>

        {!target ? (
          // ── Étape 1 : choisir la cible ──
          <div className="space-y-2">
            <Label htmlFor="merge-target-search">Société cible (conservée)</Label>
            <div className="relative">
              <Search
                className="text-md-text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="merge-target-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher la société à conserver…"
                className="pl-8"
                autoComplete="off"
              />
            </div>
            {searching ? (
              <p className="text-md-text-muted flex items-center gap-1.5 px-1 text-xs">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Recherche…
              </p>
            ) : query.trim().length >= 2 && results.length === 0 ? (
              <p className="text-md-text-muted px-1 text-xs">Aucune société trouvée.</p>
            ) : (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectTarget(r)}
                      className="hover:bg-muted/50 w-full px-3 py-2 text-left text-sm"
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : loadingImpact ? (
          <p className="text-md-text-muted flex items-center gap-1.5 py-4 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Calcul de l&apos;impact…
          </p>
        ) : impact ? (
          // ── Étape 2 : récap + confirmation ──
          <div className="space-y-3">
            <div className="border-md-border bg-muted/30 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-md-danger font-semibold line-through">
                  {impact.source.name}
                </span>
                <GitMerge className="text-md-text-muted size-4 shrink-0" aria-hidden />
                <span className="text-md-blue-dark font-semibold">{impact.target.name}</span>
              </div>
              <ul className="text-md-text mt-3 space-y-1 text-xs">
                <li>• {impact.counts.prospects} prospect(s) déplacé(s)</li>
                <li>• {impact.counts.contacts} contact(s) déplacé(s)</li>
                <li>• {impact.counts.reminders} rappel(s) déplacé(s)</li>
                {impact.counts.affiliate_claims > 0 ? (
                  <li>• {impact.counts.affiliate_claims} claim(s) affilié déplacé(s)</li>
                ) : null}
                {impact.sellsy_backfill ? (
                  <li className="text-md-blue">
                    • La cible héritera du lien Sellsy ({impact.source.sellsy_id})
                  </li>
                ) : null}
                {impact.siren_backfill ? (
                  <li className="text-md-blue">
                    • La cible héritera du SIREN ({impact.source.siren})
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merge-confirm">
                Tapez <code className="bg-md-bg-soft rounded px-1 py-0.5">FUSIONNER</code> pour
                confirmer
              </Label>
              <Input
                id="merge-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="FUSIONNER"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setTarget(null);
                setImpact(null);
                setConfirmation('');
              }}
              className="text-md-text-muted text-xs underline"
            >
              ← Choisir une autre cible
            </button>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              resetAll();
            }}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button variant="destructive" onClick={handleMerge} disabled={!canMerge}>
            {pending ? 'Fusion…' : 'Fusionner définitivement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
