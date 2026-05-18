'use client';

/**
 * P6.x.2a — Section "Emplacement Stand" sur la fiche prospect.
 *
 * Remplace l'ancien BoothAssignmentSection (P5.x.10 free-text) par un picker
 * relationnel qui list les stands libres + celui éventuellement déjà assigné
 * à ce prospect.
 *
 * Si stand assigné : affichage + boutons "Changer" / "Retirer".
 * Sinon : bouton "+ Assigner un stand" → modale picker filtrable.
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
import {
  assignStandToProspectAction,
  removeStandFromProspectAction,
} from '@/lib/admin/stands/actions';

const STATUS_LABEL: Record<string, string> = {
  libre: 'Libre',
  reserve: 'Réservé',
  paye: 'Payé',
  bloque: 'Bloqué',
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

export interface StandPickerSectionProps {
  prospectId: string;
  currentStand: {
    id: string;
    number: string;
    salle: string;
    taille_m2: number;
    status: string;
  } | null;
  /** Catalogue de stands disponibles (libres + celui éventuellement déjà assigné
   *  à ce prospect). Chargé côté server pour éviter un round-trip au mount. */
  availableStands: StandLite[];
}

export function StandPickerSection(props: StandPickerSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filterTaille, setFilterTaille] = useState<'all' | '6' | '9'>('all');
  const [search, setSearch] = useState('');
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let list = props.availableStands.filter((s) => s.id !== props.currentStand?.id);
    if (filterTaille === '6') list = list.filter((s) => s.taille_m2 === 6);
    if (filterTaille === '9') list = list.filter((s) => s.taille_m2 === 9);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.number.toLowerCase().includes(q));
    return list;
  }, [props.availableStands, props.currentStand?.id, filterTaille, search]);

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset filtres à la fermeture (event-driven, pas via useEffect).
      setFilterTaille('all');
      setSearch('');
    }
  }

  function handleAssign(stand: StandLite) {
    setBusy(true);
    startTx(async () => {
      const r = await assignStandToProspectAction({
        stand_id: stand.id,
        prospect_id: props.prospectId,
      });
      setBusy(false);
      if (r.ok) {
        toast.success(`Stand ${stand.number} assigné.`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleRemove() {
    if (!props.currentStand) return;
    setBusy(true);
    startTx(async () => {
      const r = await removeStandFromProspectAction({ stand_id: props.currentStand!.id });
      setBusy(false);
      if (r.ok) {
        toast.success('Stand libéré.');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="bg-card border-md-border space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Emplacement stand
        </h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            {props.currentStand ? 'Changer' : 'Assigner un stand'}
          </Button>
          {props.currentStand ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemove}
              disabled={busy}
              className="text-md-magenta hover:text-md-magenta/80"
            >
              <X className="size-3.5" aria-hidden />
              Retirer
            </Button>
          ) : null}
        </div>
      </div>

      {props.currentStand ? (
        <div className="flex items-center gap-3">
          <MapPin className="text-md-blue size-5 shrink-0" aria-hidden />
          <div>
            <div className="text-md-text text-lg font-bold">Stand {props.currentStand.number}</div>
            <div className="text-md-text-muted text-xs">
              {props.currentStand.salle} · {props.currentStand.taille_m2} m² ·{' '}
              {STATUS_LABEL[props.currentStand.status] ?? props.currentStand.status}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-md-text-muted text-sm">Pas encore d&apos;emplacement attribué.</p>
      )}

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {props.currentStand ? 'Changer le stand' : 'Assigner un stand'}
            </DialogTitle>
            <DialogDescription>
              Sélectionne un stand libre. Le statut sera défini automatiquement selon le statut du
              prospect.
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

          <div className="max-h-[400px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-md-text-muted py-8 text-center text-sm">
                Aucun stand libre pour ces filtres.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAssign(s)}
                      className="border-md-border hover:border-md-magenta focus-visible:ring-md-magenta/40 flex w-full flex-col items-start gap-0.5 rounded-md border bg-emerald-50 p-2 text-left transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2"
                    >
                      <span className="text-md-blue-dark text-base font-extrabold">{s.number}</span>
                      <span className="text-md-text-muted text-[10px]">
                        {s.salle} · {s.taille_m2} m²
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Fermer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
