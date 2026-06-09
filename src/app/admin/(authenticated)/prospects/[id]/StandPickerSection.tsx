'use client';

/**
 * P6.x.MultiBooths — Section "Emplacements stands" sur la fiche prospect.
 *
 * Un prospect peut détenir N stands (espace premium étendu). On affiche la
 * liste des stands assignés (badges, retrait rapide) + une modale multi-select
 * (grid groupé par salle) pour poser l'ensemble en un appel via
 * setProspectBoothsAction (mode 'replace').
 *
 * Cas le plus fréquent (1 stand) : l'UI reste aussi lisible qu'un sélecteur
 * unique — un seul badge + bouton "Gérer".
 *
 * Le montant (estimated_amount) n'est PAS impacté : l'allocation physique est
 * découplée du prix (piloté par le QuoteBuilder).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, MapPin, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { removeStandFromProspectAction } from '@/lib/admin/stands/actions';
import { setProspectBoothsAction } from '@/lib/admin/stands/multi-booth-actions';

const SALLE_LABEL: Record<string, string> = {
  delorme: 'Salle Delorme',
  gabriel: 'Salle Gabriel',
  le_notre: 'Salle Le Nôtre',
  foyer: 'Foyer',
  mezzanine: 'Mezzanine',
  soufflot: 'Salle Soufflot',
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  libre: { className: 'bg-emerald-100 text-emerald-800', label: 'Libre' },
  reserve: { className: 'bg-orange-100 text-orange-800', label: 'Réservé' },
  paye: { className: 'bg-red-100 text-red-800', label: 'Payé' },
  bloque: { className: 'bg-slate-300 text-slate-800', label: 'Bloqué' },
};

interface StandLite {
  id: string;
  number: string;
  salle: string;
  taille_m2: number;
  pole_recommended: string | null;
  status: string;
  prospect_id: string | null;
}

export interface CurrentStandLite {
  id: string;
  number: string;
  salle: string;
  taille_m2: number;
  status: string;
}

export interface StandPickerSectionProps {
  prospectId: string;
  /** Stands actuellement assignés à ce prospect. */
  currentStands: CurrentStandLite[];
  /** Catalogue assignable : stands libres + ceux déjà assignés à ce prospect. */
  availableStands: StandLite[];
}

const SOFT_WARN_THRESHOLD = 6;

export function StandPickerSection(props: StandPickerSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filterTaille, setFilterTaille] = useState<'all' | '6' | '9'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState(false);

  const currentIds = useMemo(
    () => new Set(props.currentStands.map((s) => s.id)),
    [props.currentStands],
  );

  function openDialog() {
    // Pré-sélection = stands actuellement assignés (event-driven, pas useEffect).
    setSelected(new Set(currentIds));
    setFilterTaille('all');
    setSearch('');
    setOpen(true);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) openDialog();
    else setOpen(false);
  }

  const filtered = useMemo(() => {
    let list = props.availableStands;
    if (filterTaille === '6') list = list.filter((s) => s.taille_m2 === 6);
    if (filterTaille === '9') list = list.filter((s) => s.taille_m2 === 9);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.number.toLowerCase().includes(q));
    return list;
  }, [props.availableStands, filterTaille, search]);

  const groupedBySalle = useMemo(() => {
    const groups = new Map<string, StandLite[]>();
    for (const s of filtered) {
      const arr = groups.get(s.salle) ?? [];
      arr.push(s);
      groups.set(s.salle, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setBusy(true);
    startTx(async () => {
      const r = await setProspectBoothsAction({
        prospect_id: props.prospectId,
        booth_ids: Array.from(selected),
        mode: 'replace',
      });
      setBusy(false);
      if (r.ok) {
        const n = r.data.total_count;
        toast.success(`${n} bloc${n > 1 ? 's' : ''} assigné${n > 1 ? 's' : ''}.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleQuickRemove(standId: string) {
    setBusy(true);
    startTx(async () => {
      const r = await removeStandFromProspectAction({ stand_id: standId });
      setBusy(false);
      if (r.ok) {
        toast.success('Stand libéré.');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const count = props.currentStands.length;

  return (
    <div className="bg-card border-md-border space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Emplacements stands{count > 0 ? ` (${count})` : ''}
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={openDialog}>
          <Plus className="size-3.5" aria-hidden />
          {count > 0 ? 'Gérer' : 'Assigner des stands'}
        </Button>
      </div>

      {count === 0 ? (
        <p className="text-md-text-muted text-sm">Pas encore d&apos;emplacement attribué.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.currentStands.map((s) => (
            <span
              key={s.id}
              className="border-md-border inline-flex items-center gap-1.5 rounded-lg border bg-white py-1 pr-1 pl-2.5 text-sm shadow-sm"
            >
              <MapPin className="text-md-blue size-3.5 shrink-0" aria-hidden />
              <span className="text-md-text font-bold">{s.number}</span>
              <span className="text-md-text-muted text-[11px]">
                {SALLE_LABEL[s.salle] ?? s.salle} · {s.taille_m2} m²
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  STATUS_BADGE[s.status]?.className ?? 'bg-slate-200'
                }`}
              >
                {STATUS_BADGE[s.status]?.label ?? s.status}
              </span>
              <button
                type="button"
                onClick={() => handleQuickRemove(s.id)}
                disabled={busy}
                aria-label={`Retirer le stand ${s.number}`}
                className="text-md-text-muted hover:bg-muted hover:text-md-magenta rounded p-0.5 transition disabled:opacity-50"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {count >= SOFT_WARN_THRESHOLD ? (
        <p className="text-sm font-medium text-orange-600">
          ⚠️ Beaucoup de blocs ({count}) — espace premium étendu, vérifiez le devis.
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gérer les emplacements</DialogTitle>
            <DialogDescription>
              Sélectionnez un ou plusieurs stands. Le statut sera défini automatiquement selon le
              statut du prospect. Le montant n&apos;est pas impacté (allocation physique).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher un numéro (ex: L05)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-md-border focus-visible:border-md-magenta/40 flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none"
            />
            <div className="flex gap-1">
              {(['all', '6', '9'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilterTaille(v)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                    filterTaille === v
                      ? 'bg-md-magenta text-white'
                      : 'border-md-border text-md-text hover:bg-muted border bg-white'
                  }`}
                >
                  {v === 'all' ? 'Toutes' : `${v} m²`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-md-text-muted">
              {selected.size} bloc{selected.size > 1 ? 's' : ''} sélectionné
              {selected.size > 1 ? 's' : ''}
            </span>
            {selected.size >= SOFT_WARN_THRESHOLD ? (
              <span className="font-medium text-orange-600">⚠️ {selected.size} blocs</span>
            ) : null}
          </div>

          <div className="max-h-[380px] space-y-4 overflow-y-auto">
            {groupedBySalle.length === 0 ? (
              <p className="text-md-text-muted py-8 text-center text-sm">
                Aucun stand pour ces filtres.
              </p>
            ) : (
              groupedBySalle.map(([salle, list]) => (
                <div key={salle}>
                  <h4 className="text-md-blue-dark mb-2 text-xs font-bold tracking-wide uppercase">
                    {SALLE_LABEL[salle] ?? salle}
                  </h4>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {list.map((s) => {
                      const isSelected = selected.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={busy}
                          onClick={() => toggle(s.id)}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex flex-col items-start gap-0.5 rounded-md border p-2 text-left transition focus:outline-none focus-visible:ring-2',
                            isSelected
                              ? 'bg-md-magenta border-md-magenta text-white'
                              : 'border-md-border hover:border-md-magenta bg-emerald-50 hover:bg-emerald-100',
                          )}
                        >
                          <span className="text-base font-extrabold">{s.number}</span>
                          <span
                            className={cn(
                              'text-[10px]',
                              isSelected ? 'text-white/80' : 'text-md-text-muted',
                            )}
                          >
                            {s.taille_m2} m²
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button type="button" onClick={handleSave} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                `Enregistrer ${selected.size} bloc${selected.size > 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
