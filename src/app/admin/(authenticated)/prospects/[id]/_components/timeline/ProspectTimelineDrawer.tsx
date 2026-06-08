'use client';

/**
 * P14.3.ProspectTimelineDrawer — drawer principal (Sheet right side).
 *
 * 'use client' : open state + click trigger.
 *
 * Donnees servies en props par le server component parent (page.tsx).
 * Apres mutation, router.refresh() re-render le server component, qui
 * re-fetch + re-passe les nouvelles props (pattern P14.1 idem).
 */

import { useState } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import type { TimelineEntry, ProspectContactLite } from '@/lib/admin/prospects/timeline-helpers';
import { NoteForm } from './NoteForm';
import { TimelineEntryNote } from './TimelineEntry';
import { CalendarEventEntry } from './CalendarEventEntry';

type Props = {
  prospectId: string;
  companyName: string;
  initialTimeline: TimelineEntry[];
  contacts: ProspectContactLite[];
  currentUserId: string;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
};

export function ProspectTimelineDrawer({
  prospectId,
  companyName,
  initialTimeline,
  contacts,
  currentUserId,
  currentUserRole,
}: Props) {
  const [open, setOpen] = useState(false);
  const noteCount = initialTimeline.filter((e) => e.entry_type === 'note').length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="bg-card border-md-border hover:border-md-blue text-md-text inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
        >
          <MessageSquareText className="size-4" aria-hidden />
          Timeline
          {noteCount > 0 ? (
            <span className="bg-md-blue-light text-md-blue-dark rounded-full px-1.5 text-[10px] font-bold">
              {noteCount}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:w-[600px] sm:max-w-[600px]"
        aria-describedby="timeline-desc"
      >
        {/* Header fixe */}
        <div className="border-md-border bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-md-blue-dark truncate text-base font-bold">
              Timeline · {companyName}
            </SheetTitle>
            <SheetDescription id="timeline-desc" className="text-md-text-muted mt-0.5 text-xs">
              Notes, rendez-vous, appels — tout l&apos;historique de la relation.
            </SheetDescription>
          </div>
          <SheetClose aria-label="Fermer" className="text-md-text-muted hover:text-md-text p-1">
            <X className="size-4" aria-hidden />
          </SheetClose>
        </div>

        {/* Form sticky-top */}
        <div className="border-md-border bg-md-bg/30 sticky top-[60px] z-10 border-b px-5 py-3">
          <NoteForm prospectId={prospectId} contacts={contacts} />
        </div>

        {/* Timeline scrollable */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {initialTimeline.length === 0 ? (
            <p className="text-md-text-muted py-12 text-center text-sm">
              Aucune entrée pour le moment. Ajoute une première note ci-dessus.
            </p>
          ) : (
            initialTimeline.map((entry) =>
              entry.entry_type === 'note' ? (
                <TimelineEntryNote
                  key={`note-${entry.id}`}
                  entry={entry}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              ) : (
                <CalendarEventEntry key={`ce-${entry.id}`} entry={entry} />
              ),
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
