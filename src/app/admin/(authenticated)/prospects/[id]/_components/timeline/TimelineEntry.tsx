'use client';

/**
 * P14.3.ProspectTimelineDrawer — bubble pour une note manuelle.
 *
 * 'use client' : onClick (soft delete) + state hover.
 *
 * Layout chat-bubble :
 *   ┌───────────────────────────────────────────┐
 *   │ Avatar │ Auteur · il y a 3 min            │
 *   │        │ Note content (wrap, max-w-prose) │
 *   │        │ → Contact tague (optionnel)      │
 *   └───────────────────────────────────────────┘
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils/format-time-ago';
import type { TimelineEntry } from '@/lib/admin/prospects/timeline-helpers';
import { softDeleteProspectNoteAction } from '@/lib/admin/prospects/notes-actions';

type Props = {
  entry: TimelineEntry;
  currentUserId: string;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
};

function initialsOf(actor: TimelineEntry['actor']): string {
  if (!actor) return '·';
  const name = actor.full_name ?? actor.email;
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function TimelineEntryNote({ entry, currentUserId, currentUserRole }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isAuthor = entry.actor?.id === currentUserId;
  const isSuperAdmin = currentUserRole === 'super_admin';
  const canDelete = isAuthor || isSuperAdmin;

  const authorLabel = entry.actor
    ? entry.actor.full_name?.trim() || entry.actor.email
    : 'Note système';

  function onDelete() {
    if (!confirm('Supprimer cette note ?')) return;
    startTransition(async () => {
      const res = await softDeleteProspectNoteAction({ id: entry.id });
      if (!res.ok) {
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="group border-md-border bg-card relative flex gap-3 rounded-lg border p-3 shadow-sm">
      <div className="bg-md-blue-light text-md-blue-dark flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
        {initialsOf(entry.actor)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-md-text-muted flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="text-md-text font-semibold">{authorLabel}</span>
          <span>·</span>
          <time dateTime={entry.event_at}>{formatTimeAgo(entry.event_at)}</time>
          {entry.contact ? (
            <>
              <span>·</span>
              <span className="text-md-blue">
                avec <strong>{entry.contact.full_name}</strong>
              </span>
            </>
          ) : null}
        </div>
        <p className="text-md-text mt-1 text-sm whitespace-pre-wrap">{entry.content}</p>
      </div>
      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label="Supprimer cette note"
          className="text-md-text-muted absolute top-2 right-2 hidden p-1 group-hover:block hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
