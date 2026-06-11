'use client';

/**
 * P14.1.SalesCalendarCore — section "📅 Calendrier" sur la fiche prospect.
 *
 * Affiche :
 *   - Onglet "Prochaines actions" (status=pending, start_at futur).
 *   - Onglet "Historique" (events done/cancelled/missed OU passes).
 *   - Empty state avec bouton "+ Planifier une relance" si rien upcoming.
 *   - Alerte intelligente si aucune relance + last_activity > 14j.
 *
 * Le modal CalendarEventFormModal est pre-rempli avec defaultProspectId.
 */

import { useEffect, useState, useTransition } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatParisDateTime } from '@/lib/format/dates';
import {
  getEventTypeIcon,
  getEventTypeColor,
  getEventStatusColor,
  type CalendarEventRow,
} from '@/lib/admin/calendar/helpers';
import { listEventsForProspectAction } from '@/lib/admin/calendar/prospect-actions';
import { CalendarEventFormModal } from '@/app/admin/(authenticated)/calendar/_components/CalendarEventFormModal';

interface Props {
  prospectId: string;
  companyName: string;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
  googleConnected?: boolean;
}

type Tab = 'upcoming' | 'history';

export function ProspectCalendarSection({
  prospectId,
  companyName,
  currentUserRole,
  googleConnected = false,
}: Props) {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [upcoming, setUpcoming] = useState<CalendarEventRow[]>([]);
  const [past, setPast] = useState<CalendarEventRow[]>([]);
  const [daysSince, setDaysSince] = useState<number | null>(null);
  const [overdue, setOverdue] = useState(false);
  const [loading, startLoading] = useTransition();
  const [modal, setModal] = useState<
    | { open: false }
    | { open: true; mode: 'create' }
    | { open: true; mode: 'edit'; event: CalendarEventRow }
  >({ open: false });

  function refresh() {
    startLoading(async () => {
      const r = await listEventsForProspectAction({ prospect_id: prospectId });
      if (r.ok) {
        setUpcoming(r.upcoming);
        setPast(r.past);
        setDaysSince(r.daysSinceLastActivity);
        setOverdue(r.hasOverdueAlert);
      }
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  const showHistoryTab = past.length > 0;
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-3">
      {/* Alerte 14j */}
      {overdue && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              ⏰ Aucune action programmée depuis <strong>{daysSince} jours</strong>. Pense à
              planifier une relance.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-amber-700 text-white hover:bg-amber-800"
            onClick={() => setModal({ open: true, mode: 'create' })}
          >
            <Plus className="mr-1 size-3" /> Planifier
          </Button>
        </div>
      )}

      {/* Header + tabs */}
      <div className="border-md-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`text-xs font-semibold transition ${
              tab === 'upcoming'
                ? 'text-md-magenta border-md-magenta border-b-2 pb-1'
                : 'text-md-text-muted hover:text-md-text'
            }`}
          >
            Prochaines actions ({upcoming.length})
          </button>
          {showHistoryTab && (
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`text-xs font-semibold transition ${
                tab === 'history'
                  ? 'text-md-blue border-md-blue border-b-2 pb-1'
                  : 'text-md-text-muted hover:text-md-text'
              }`}
            >
              Historique ({past.length})
            </button>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setModal({ open: true, mode: 'create' })}
        >
          <Plus className="mr-1 size-3" /> Planifier une action
        </Button>
      </div>

      {/* Empty state */}
      {!loading && list.length === 0 && tab === 'upcoming' && (
        <div className="border-md-border text-md-text-muted rounded-md border border-dashed bg-white/40 p-6 text-center text-xs">
          <CalendarIcon className="mx-auto mb-2 size-6 opacity-50" aria-hidden />
          <p>Aucune action programmée pour ce prospect.</p>
          <Button
            type="button"
            size="sm"
            className="bg-md-magenta hover:bg-md-magenta-soft mt-3"
            onClick={() => setModal({ open: true, mode: 'create' })}
          >
            + Planifier une relance
          </Button>
        </div>
      )}

      {loading && <p className="text-md-text-muted text-center text-xs">Chargement…</p>}

      {/* Liste */}
      <ul className="space-y-2">
        {list.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            onEdit={() => setModal({ open: true, mode: 'edit', event: e })}
          />
        ))}
      </ul>

      {modal.open && (
        <CalendarEventFormModal
          mode={modal.mode}
          initialEvent={modal.mode === 'edit' ? modal.event : undefined}
          defaultProspectId={prospectId}
          defaultTitle={modal.mode === 'create' ? `Relance ${companyName}` : undefined}
          defaultType={modal.mode === 'create' ? 'call_relance' : undefined}
          currentUserRole={currentUserRole}
          googleConnected={googleConnected}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EventCard({ event, onEdit }: { event: CalendarEventRow; onEdit: () => void }) {
  const start = formatParisDateTime(event.start_at, 'fr', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="border-md-border hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border bg-white p-3 text-left transition"
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-lg ${getEventTypeColor(
            event.event_type,
          )}`}
        >
          {getEventTypeIcon(event.event_type)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-md-text truncate text-sm font-semibold">{event.title}</p>
          <p className="text-md-text-muted text-xs">
            {start}
            {event.duration_minutes ? ` · ${event.duration_minutes} min` : ''}
          </p>
          {event.outcome && (
            <p className="text-md-text-muted mt-0.5 text-[11px] italic">
              ↳ {event.outcome.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getEventStatusColor(event.status)}`}
        >
          {event.status}
        </span>
        <ChevronRight className="text-md-text-muted size-4 shrink-0" aria-hidden />
      </button>
    </li>
  );
}
