'use client';

/**
 * P14.2.SalesCalendarGoogleSync — section settings "Synchronisation Google
 * Calendar". 'use client' (handlers : connect/disconnect/toggle/select).
 *
 * Flux connect : connectGoogleCalendarAction renvoie l'URL de consentement →
 * window.location.href (full redirect, pas un fetch). Le callback Google
 * revient sur /admin/calendar/settings?google=connected → toast (géré ici via
 * la prop justConnected/connectionError lue par la page).
 *
 * i18n FR + EN via COPY (locale prop dérivé de users.language).
 */

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Plug, PlugZap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatParisDateTime } from '@/lib/format/dates';
import type { AdminLocale } from '@/lib/admin/calendar/i18n-helpers';
import {
  connectGoogleCalendarAction,
  disconnectGoogleCalendarAction,
  setSyncCalendarAction,
  toggleSyncEnabledAction,
  listGoogleCalendarsAction,
  type GoogleSyncStatus,
  type GoogleCalendarOption,
} from '@/lib/admin/calendar/google/connect-actions';

interface Props {
  initialStatus: GoogleSyncStatus;
  locale: AdminLocale;
  justConnected: boolean;
  connectionError: string | null;
}

const COPY = {
  fr: {
    title: '🔄 Synchronisation Google Calendar',
    subtitle:
      'Synchronisation bidirectionnelle : tes évènements MDS apparaissent dans Google et inversement. Génère aussi des liens Google Meet.',
    notConnected: 'Aucun compte Google connecté.',
    connect: 'Connecter Google Calendar',
    connectedAs: 'Connecté :',
    disconnect: 'Déconnecter',
    disconnectConfirm:
      'Déconnecter Google Calendar ? La synchronisation s’arrêtera et les liens seront retirés.',
    calendarLabel: 'Calendrier cible',
    calendarHint: 'Les évènements MDS sont poussés vers ce calendrier.',
    loadingCalendars: 'Chargement des calendriers…',
    syncEnabled: 'Synchronisation active',
    syncDisabled: 'Synchronisation en pause',
    enable: 'Activer',
    disable: 'Mettre en pause',
    lastSync: 'Dernière synchro :',
    never: 'jamais',
    syncError: 'Dernière erreur :',
    connectedToast: '✅ Google Calendar connecté.',
    disconnectedToast: 'Google Calendar déconnecté.',
    errorToast: 'Échec de la connexion Google',
    refreshCalendars: 'Rafraîchir',
  },
  en: {
    title: '🔄 Google Calendar sync',
    subtitle:
      'Two-way sync: your MDS events appear in Google and vice versa. Also generates Google Meet links.',
    notConnected: 'No Google account connected.',
    connect: 'Connect Google Calendar',
    connectedAs: 'Connected:',
    disconnect: 'Disconnect',
    disconnectConfirm: 'Disconnect Google Calendar? Sync will stop and links will be removed.',
    calendarLabel: 'Target calendar',
    calendarHint: 'MDS events are pushed to this calendar.',
    loadingCalendars: 'Loading calendars…',
    syncEnabled: 'Sync active',
    syncDisabled: 'Sync paused',
    enable: 'Enable',
    disable: 'Pause',
    lastSync: 'Last sync:',
    never: 'never',
    syncError: 'Last error:',
    connectedToast: '✅ Google Calendar connected.',
    disconnectedToast: 'Google Calendar disconnected.',
    errorToast: 'Google connection failed',
    refreshCalendars: 'Refresh',
  },
} as const;

export function GoogleSyncSettingsClient({
  initialStatus,
  locale,
  justConnected,
  connectionError,
}: Props) {
  const router = useRouter();
  const c = COPY[locale];
  const [status, setStatus] = useState<GoogleSyncStatus>(initialStatus);
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [loadingCals, setLoadingCals] = useState(false);
  const [pending, startTransition] = useTransition();

  // Toast post-callback (one-shot) + nettoie l'URL.
  useEffect(() => {
    if (justConnected) {
      toast.success(c.connectedToast);
      router.replace('/admin/calendar/settings');
    } else if (connectionError) {
      toast.error(`${c.errorToast} (${connectionError}).`);
      router.replace('/admin/calendar/settings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justConnected, connectionError]);

  // Charge la liste des calendriers quand connecté. Fetch-on-deps-change
  // (sync système externe Google → state React), pattern identique à
  // CalendarShell.fetchEvents.
  useEffect(() => {
    if (!status.connected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCals(true);
    listGoogleCalendarsAction()
      .then((r) => {
        if (r.ok) setCalendars(r.data);
      })
      .finally(() => setLoadingCals(false));
     
  }, [status.connected]);

  function handleConnect() {
    startTransition(async () => {
      const r = await connectGoogleCalendarAction();
      if (r.ok) {
        window.location.href = r.data.url;
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleDisconnect() {
    if (!confirm(c.disconnectConfirm)) return;
    startTransition(async () => {
      const r = await disconnectGoogleCalendarAction();
      if (r.ok) {
        toast.success(c.disconnectedToast);
        setStatus({ ...status, connected: false });
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleCalendarChange(calendarId: string) {
    startTransition(async () => {
      const r = await setSyncCalendarAction({ calendar_id: calendarId });
      if (r.ok) {
        setStatus({ ...status, calendarId });
        toast.success('OK');
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleToggleSync() {
    const next = !status.syncEnabled;
    startTransition(async () => {
      const r = await toggleSyncEnabledAction({ enabled: next });
      if (r.ok) {
        setStatus({ ...status, syncEnabled: next });
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <section className="border-md-border bg-card rounded-lg border p-5 shadow-sm">
      <h2 className="text-md-blue-dark mb-1 text-sm font-bold tracking-wide uppercase">
        {c.title}
      </h2>
      <p className="text-md-text-muted mb-4 text-xs">{c.subtitle}</p>

      {!status.connected ? (
        <div className="space-y-3">
          <p className="text-md-text-muted text-sm">{c.notConnected}</p>
          <Button type="button" onClick={handleConnect} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Plug className="mr-1 size-4" />
            )}
            {c.connect}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compte connecté + déconnexion */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-md-text text-sm">
              <Check className="mr-1 inline size-4 text-emerald-600" />
              {c.connectedAs} <strong>{status.email ?? '—'}</strong>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={pending}
              className="text-red-600 hover:bg-red-50"
            >
              <PlugZap className="mr-1 size-3" /> {c.disconnect}
            </Button>
          </div>

          {/* Calendrier cible */}
          <div className="space-y-1.5">
            <label className="text-md-text text-xs font-semibold">{c.calendarLabel}</label>
            <div className="flex items-center gap-2">
              <select
                value={status.calendarId}
                onChange={(e) => handleCalendarChange(e.target.value)}
                disabled={pending || loadingCals}
                className="border-md-border h-9 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm"
              >
                {/* Toujours offrir l'option courante même si la liste charge. */}
                {calendars.length === 0 && (
                  <option value={status.calendarId}>{status.calendarId}</option>
                )}
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                    {cal.primary ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {loadingCals && <Loader2 className="text-md-text-muted size-4 animate-spin" />}
            </div>
            <p className="text-md-text-muted text-[11px]">{c.calendarHint}</p>
          </div>

          {/* Toggle sync */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                status.syncEnabled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              <RefreshCw className={`size-3 ${pending ? 'animate-spin' : ''}`} />
              {status.syncEnabled ? c.syncEnabled : c.syncDisabled}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleSync}
              disabled={pending}
            >
              {status.syncEnabled ? c.disable : c.enable}
            </Button>
          </div>

          {/* Statut dernière synchro */}
          <p className="text-md-text-muted text-[11px]">
            {c.lastSync}{' '}
            {status.lastSyncedAt
              ? formatParisDateTime(status.lastSyncedAt, locale, {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : c.never}
          </p>
          {status.lastSyncError && (
            <p className="text-md-danger text-[11px]">
              {c.syncError} {status.lastSyncError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
