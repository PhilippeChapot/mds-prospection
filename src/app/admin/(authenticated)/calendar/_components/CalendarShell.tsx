'use client';

/**
 * P14.1.SalesCalendarCore — shell client autour de react-big-calendar.
 *
 * Responsabilites :
 *   - Maintenir l etat view (Month/Week/Day/Agenda) + date courante.
 *   - Charger les events via listCalendarEventsAction quand range/filter
 *     change.
 *   - Render le <Calendar> avec eventPropGetter pour couleurs par type.
 *   - Ouvrir le modal de creation au click sur un slot vide + edition au
 *     click sur un event existant.
 *
 * Doctrine timezone Europe/Paris : les dates sont serialisees en ISO UTC
 * cote DB, parse en Date locale cote browser (typiquement Europe/Paris
 * pour les sales). Le tooltip + le header affichent via formatParisDateTime
 * pour cas hors-FR.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Calendar, type View, type SlotInfo } from 'react-big-calendar';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { calendarLocalizer, getCalendarMessages } from '@/lib/admin/calendar/calendar-localizer';
import {
  getEventTypeColor,
  getEventTypeIcon,
  type CalendarEventRow,
  type CalendarEventType,
} from '@/lib/admin/calendar/helpers';
import { listCalendarEventsAction } from '@/lib/admin/calendar/actions';
import { CalendarEventFormModal } from './CalendarEventFormModal';
import 'react-big-calendar/lib/css/react-big-calendar.css';

interface Props {
  currentUserId: string;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
  /** P14.2 — Google connecté + sync active (affiche la case "Générer un Meet"). */
  googleConnected?: boolean;
}

type RbcEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarEventRow;
};

const TYPE_OPTIONS: Array<{ value: CalendarEventType | ''; label: string }> = [
  { value: '', label: 'Tous les types' },
  { value: 'call_relance', label: '📞 Appels' },
  { value: 'meeting', label: '👥 RDV' },
  { value: 'task', label: '✅ Tâches' },
];

const VIEWS: View[] = ['month', 'week', 'day', 'agenda'];

export function CalendarShell({ currentUserId, currentUserRole, googleConnected = false }: Props) {
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<CalendarEventType | ''>('');
  const [showAll, setShowAll] = useState(false); // super_admin : voir tous les events
  const [modalState, setModalState] = useState<
    | { open: false }
    | { open: true; mode: 'create'; slot?: { start: Date; end: Date } }
    | { open: true; mode: 'edit'; event: CalendarEventRow }
  >({ open: false });

  // Calcul du range a fetcher selon la vue.
  const { startRange, endRange } = useMemo(() => {
    const d = new Date(date);
    if (view === 'month') {
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59);
      return { startRange: start.toISOString(), endRange: end.toISOString() };
    }
    if (view === 'agenda') {
      const start = new Date(d);
      start.setDate(start.getDate() - 7);
      const end = new Date(d);
      end.setDate(end.getDate() + 30);
      return { startRange: start.toISOString(), endRange: end.toISOString() };
    }
    if (view === 'day') {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return { startRange: start.toISOString(), endRange: end.toISOString() };
    }
    // week
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startRange: start.toISOString(), endRange: end.toISOString() };
  }, [view, date]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listCalendarEventsAction({
        start_range: startRange,
        end_range: endRange,
        event_type: filterType || undefined,
        user_id: showAll && currentUserRole === 'super_admin' ? undefined : currentUserId,
      });
      if (r.ok) {
        setEvents(r.events ?? []);
      } else {
        toast.error(r.error);
      }
    } finally {
      setLoading(false);
    }
  }, [startRange, endRange, filterType, showAll, currentUserId, currentUserRole]);

  useEffect(() => {
    // Sync external (Supabase) -> React state : pattern fetch-on-mount-or-deps-change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEvents();
  }, [fetchEvents]);

  const rbcEvents: RbcEvent[] = useMemo(
    () =>
      events.map((e) => {
        const start = new Date(e.start_at);
        const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 30 * 60 * 1000);
        return {
          title: `${getEventTypeIcon(e.event_type)} ${e.title}`,
          start,
          end,
          allDay: e.is_all_day,
          resource: e,
        };
      }),
    [events],
  );

  function handleSelectSlot(slot: SlotInfo) {
    setModalState({
      open: true,
      mode: 'create',
      slot: { start: slot.start as Date, end: slot.end as Date },
    });
  }

  function handleSelectEvent(rbcEvent: RbcEvent) {
    setModalState({ open: true, mode: 'edit', event: rbcEvent.resource });
  }

  function handleCloseModal(refresh = false) {
    setModalState({ open: false });
    if (refresh) void fetchEvents();
  }

  const messages = getCalendarMessages('fr');

  return (
    <div className="space-y-4">
      {/* Toolbar filtres */}
      <div className="border-md-border bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3 shadow-sm">
        <label className="text-md-text-muted text-xs font-medium">Type :</label>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as CalendarEventType | '')}
          className="border-md-border h-8 rounded-md border bg-white px-2 text-xs"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {currentUserRole === 'super_admin' && (
          <label className="text-md-text-muted ml-2 inline-flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="size-3"
            />
            Voir tous les sales
          </label>
        )}
        <div className="flex-1" />
        {loading && <span className="text-md-text-muted text-xs">Chargement…</span>}
        <Link
          href="/admin/calendar/settings"
          title="Paramètres / Synchroniser avec Apple ou Google Calendar"
          className="text-md-text-muted hover:text-md-text hover:border-md-border inline-flex size-8 items-center justify-center rounded-md border border-transparent"
        >
          ⚙️
        </Link>
        <Button
          type="button"
          size="sm"
          className="bg-md-magenta hover:bg-md-magenta-soft"
          onClick={() => setModalState({ open: true, mode: 'create' })}
        >
          + Nouvel évènement
        </Button>
      </div>

      {/* Calendar */}
      <div className="border-md-border bg-card rounded-lg border p-3 shadow-sm">
        <div style={{ height: '70vh' }}>
          <Calendar
            localizer={calendarLocalizer}
            events={rbcEvents}
            view={view}
            onView={setView}
            views={VIEWS}
            date={date}
            onNavigate={setDate}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            selectable
            popup
            eventPropGetter={(e: RbcEvent) => ({
              className: `${getEventTypeColor(e.resource.event_type)} rounded-md border px-1 text-xs`,
            })}
            culture="fr"
            messages={messages}
          />
        </div>
      </div>

      {modalState.open && (
        <CalendarEventFormModal
          mode={modalState.mode}
          initialEvent={modalState.mode === 'edit' ? modalState.event : undefined}
          initialSlot={modalState.mode === 'create' ? modalState.slot : undefined}
          currentUserRole={currentUserRole}
          googleConnected={googleConnected}
          onClose={() => handleCloseModal(false)}
          onSaved={() => handleCloseModal(true)}
        />
      )}
    </div>
  );
}
