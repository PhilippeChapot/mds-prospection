'use client';

/**
 * P14.1.SalesCalendarCore — modal de creation / edition d un event
 * calendrier.
 *
 * Modes :
 *   - 'create' : prerempli depuis initialSlot (si clic sur creneau vide
 *     dans la grille) ou vide (si bouton "+ Nouvel evenement").
 *   - 'edit'   : prerempli depuis initialEvent. Bouton supplementaire
 *     "Marquer comme fait" + "Supprimer".
 *
 * Defense en profondeur overlap :
 *   - Le server action verifie via checkOverlap + DB EXCLUDE constraint.
 *   - Si error.code='overlap' : on affiche le warning UI + bouton
 *     "Forcer le creneau" (super_admin only).
 *   - Si error.code='super_admin_required' : message friendly sans bouton.
 *
 * Pas de combobox prospect en V1 — le prospect_id arrive depuis l URL
 * (search param) ou depuis la fiche prospect (defaultProspectId prop a
 * ajouter en commit 3).
 */

import { useState, useTransition } from 'react';
import { Loader2, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  createCalendarEventAction,
  updateCalendarEventAction,
  deleteCalendarEventAction,
  markCalendarEventDoneAction,
} from '@/lib/admin/calendar/actions';
import {
  CALENDAR_EVENT_TYPES,
  COMMON_OUTCOMES,
  getEventTypeIcon,
  type CalendarEventRow,
  type CalendarEventType,
  type CalendarEventPriority,
} from '@/lib/admin/calendar/helpers';

interface Props {
  mode: 'create' | 'edit';
  initialEvent?: CalendarEventRow;
  initialSlot?: { start: Date; end: Date };
  defaultProspectId?: string;
  defaultTitle?: string;
  defaultType?: CalendarEventType;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABELS: Record<CalendarEventType, string> = {
  call_relance: 'Appel',
  meeting: 'RDV',
  task: 'Tâche',
};

const PRIORITY_LABELS: Record<CalendarEventPriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
};

/**
 * Convertit Date → string compatible <input type="datetime-local">.
 * Format attendu : "YYYY-MM-DDTHH:mm" (sans seconds, sans timezone).
 * Le navigateur l interprete en TZ locale.
 */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CalendarEventFormModal({
  mode,
  initialEvent,
  initialSlot,
  defaultProspectId,
  defaultTitle,
  defaultType,
  currentUserRole,
  onClose,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [eventType, setEventType] = useState<CalendarEventType>(
    initialEvent?.event_type ?? defaultType ?? 'call_relance',
  );
  const [title, setTitle] = useState(initialEvent?.title ?? defaultTitle ?? '');
  const [description, setDescription] = useState(initialEvent?.description ?? '');
  const [location, setLocation] = useState(initialEvent?.location ?? '');
  const [startAt, setStartAt] = useState(() => {
    if (initialEvent) return toDatetimeLocal(new Date(initialEvent.start_at));
    if (initialSlot) return toDatetimeLocal(initialSlot.start);
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0); // arrondi 15min
    return toDatetimeLocal(now);
  });
  const [endAt, setEndAt] = useState(() => {
    if (initialEvent?.end_at) return toDatetimeLocal(new Date(initialEvent.end_at));
    if (initialSlot) return toDatetimeLocal(initialSlot.end);
    const start = initialEvent || initialSlot ? new Date(startAt) : new Date();
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);
    return toDatetimeLocal(end);
  });
  const [priority, setPriority] = useState<CalendarEventPriority>(
    initialEvent?.priority ?? 'normal',
  );
  const [overlapWarning, setOverlapWarning] = useState<{
    title: string;
    start_at: string;
  } | null>(null);
  const [outcome, setOutcome] = useState<string>('');

  const isTask = eventType === 'task';
  const isMeeting = eventType === 'meeting';

  function handleSubmit(forceOverlap = false) {
    if (!title.trim()) {
      toast.error('Le titre est obligatoire.');
      return;
    }
    setOverlapWarning(null);

    startTransition(async () => {
      const startIso = new Date(startAt).toISOString();
      const endIso = isTask ? null : new Date(endAt).toISOString();

      const payload = {
        event_type: eventType,
        prospect_id: defaultProspectId ?? initialEvent?.prospect_id ?? null,
        title: title.trim(),
        description: description.trim() || null,
        location: isMeeting ? location.trim() || null : null,
        start_at: startIso,
        end_at: endIso,
        is_all_day: false,
        priority,
        force_overlap: forceOverlap,
      };

      const r =
        mode === 'edit' && initialEvent
          ? await updateCalendarEventAction({ id: initialEvent.id, ...payload })
          : await createCalendarEventAction(payload);

      if (!r.ok) {
        if (r.errorCode === 'overlap' && r.conflictEvent) {
          setOverlapWarning({
            title: r.conflictEvent.title,
            start_at: r.conflictEvent.start_at,
          });
          return;
        }
        toast.error(r.error);
        return;
      }
      toast.success(mode === 'edit' ? 'Évènement mis à jour.' : 'Évènement créé.');
      onSaved();
    });
  }

  function handleMarkDone() {
    if (!initialEvent) return;
    startTransition(async () => {
      const r = await markCalendarEventDoneAction({
        id: initialEvent.id,
        outcome: outcome || undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Marqué comme fait.');
      onSaved();
    });
  }

  function handleDelete() {
    if (!initialEvent) return;
    if (!confirm('Supprimer cet évènement ?')) return;
    startTransition(async () => {
      const r = await deleteCalendarEventAction({ id: initialEvent.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Évènement supprimé.');
      onSaved();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <div className="border-md-border border-b p-4">
          <SheetTitle className="text-md-blue-dark text-lg font-bold">
            {mode === 'edit' ? "Modifier l'évènement" : 'Nouvel évènement'}
          </SheetTitle>
          <SheetDescription className="text-md-text-muted text-xs">
            {defaultProspectId ? 'Lié à ce prospect' : 'Évènement personnel'}
          </SheetDescription>
        </div>

        <div className="space-y-4 p-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Type</Label>
            <div className="flex gap-1.5">
              {CALENDAR_EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEventType(t)}
                  className={`border-md-border flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                    eventType === t ? 'bg-md-magenta text-white' : 'bg-card hover:bg-muted'
                  }`}
                >
                  {getEventTypeIcon(t)} {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-semibold">
              Titre <span className="text-md-magenta">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Relance Acme — confirmer le devis"
              maxLength={255}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-semibold">
              Notes
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              className="border-md-border w-full rounded-md border bg-white px-2 py-1.5 text-sm"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start_at" className="text-xs font-semibold">
                Début <span className="text-md-magenta">*</span>
              </Label>
              <Input
                id="start_at"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            {!isTask && (
              <div className="space-y-1.5">
                <Label htmlFor="end_at" className="text-xs font-semibold">
                  Fin <span className="text-md-magenta">*</span>
                </Label>
                <Input
                  id="end_at"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Location (meeting only) */}
          {isMeeting && (
            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-xs font-semibold">
                Lieu / Lien visio
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="https://meet.google.com/... ou adresse"
                maxLength={500}
              />
            </div>
          )}

          {/* Priority */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Priorité</Label>
            <div className="flex gap-1.5">
              {(['low', 'normal', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`border-md-border flex-1 rounded-md border px-2 py-1.5 text-xs transition ${
                    priority === p ? 'bg-md-blue text-white' : 'bg-card hover:bg-muted'
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Overlap warning */}
          {overlapWarning && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">⚠️ Créneau déjà occupé</p>
              <p className="mt-1">« {overlapWarning.title} » est déjà programmé sur cette plage.</p>
              {currentUserRole === 'super_admin' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => handleSubmit(true)}
                  disabled={pending}
                >
                  Forcer le créneau (super_admin)
                </Button>
              ) : (
                <p className="mt-1 text-amber-800/80">
                  Choisis un autre créneau ou demande à un super_admin.
                </p>
              )}
            </div>
          )}

          {/* Edit mode : mark done + outcome + delete */}
          {mode === 'edit' && initialEvent && initialEvent.status === 'pending' && (
            <div className="border-md-border space-y-2 rounded-md border bg-emerald-50 p-3">
              <Label className="text-xs font-semibold text-emerald-900">Marquer comme fait</Label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="border-md-border h-8 w-full rounded-md border bg-white px-2 text-xs"
              >
                <option value="">Sans résultat</option>
                {COMMON_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={handleMarkDone}
                disabled={pending}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Check className="mr-1 size-3" /> Marquer comme fait
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-2">
            {mode === 'edit' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={pending}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-1 size-3" /> Supprimer
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSubmit(false)}
              disabled={pending}
              className="bg-md-magenta hover:bg-md-magenta-soft"
            >
              {pending && <Loader2 className="mr-1 size-3 animate-spin" />}
              {mode === 'edit' ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
