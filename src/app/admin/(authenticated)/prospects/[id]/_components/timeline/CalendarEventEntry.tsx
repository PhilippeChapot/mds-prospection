'use client';

/**
 * P14.3.ProspectTimelineDrawer — bubble pour un calendar_event (P14.1).
 *
 * 'use client' : pas de handler interactif strictement, mais on garde
 * client pour symetrie avec TimelineEntryNote (et au cas ou on ajoute
 * "marquer fait" plus tard).
 */

import { Phone, Users, CheckSquare, Video } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils/format-time-ago';
import { formatParisDateTime } from '@/lib/format/dates';
import type { TimelineEntry } from '@/lib/admin/prospects/timeline-helpers';

type Props = { entry: TimelineEntry };

const TYPE_META = {
  call_relance: { Icon: Phone, label: 'Appel / relance', color: 'text-md-blue' },
  meeting: { Icon: Users, label: 'Rendez-vous', color: 'text-md-magenta' },
  task: { Icon: CheckSquare, label: 'Tâche', color: 'text-md-text-muted' },
} as const;

const STATUS_LABEL = {
  pending: 'À venir',
  done: 'Fait',
  missed: 'Manqué',
} as const;

export function CalendarEventEntry({ entry }: Props) {
  const meta = entry.calendar_event_type ? TYPE_META[entry.calendar_event_type] : TYPE_META.task;
  const { Icon } = meta;
  const status = entry.calendar_event_status ?? 'pending';

  const authorLabel = entry.actor ? entry.actor.full_name?.trim() || entry.actor.email : 'Système';

  return (
    <div className="border-md-border bg-md-bg/50 flex gap-3 rounded-lg border border-dashed p-3">
      <div
        className={`bg-card flex size-8 shrink-0 items-center justify-center rounded-full ${meta.color}`}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-md-text-muted flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-md-text font-semibold">{meta.label}</span>
          <span>·</span>
          <span>{authorLabel}</span>
          <span>·</span>
          <time dateTime={entry.event_at}>{formatTimeAgo(entry.event_at)}</time>
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              status === 'done'
                ? 'bg-md-blue-light text-md-blue-dark'
                : status === 'missed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="text-md-text mt-1 text-sm whitespace-pre-wrap">{entry.content}</p>
        {entry.calendar_event_start ? (
          <p className="text-md-text-muted mt-1 text-[11px]">
            {formatParisDateTime(entry.calendar_event_start, 'fr', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        ) : null}

        {/* P14.2 #8+#9 — mini chips Meet + attendees */}
        {(entry.meet_url || (entry.attendees && entry.attendees.length > 0)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {entry.meet_url && (
              <a
                href={entry.meet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 transition hover:bg-emerald-200"
                onClick={(e) => e.stopPropagation()}
              >
                <Video className="size-2.5" aria-hidden /> 🎥 Meet
              </a>
            )}
            {entry.attendees &&
              entry.attendees.length > 0 &&
              (() => {
                const accepted = entry.attendees.filter(
                  (a) => a.responseStatus === 'accepted',
                ).length;
                const declined = entry.attendees.filter(
                  (a) => a.responseStatus === 'declined',
                ).length;
                const total = entry.attendees.length;
                return (
                  <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    👥 {total}
                    {accepted > 0 && <span className="ml-0.5">{accepted}✅</span>}
                    {declined > 0 && <span className="ml-0.5">{declined}❌</span>}
                  </span>
                );
              })()}
          </div>
        )}
      </div>
    </div>
  );
}
