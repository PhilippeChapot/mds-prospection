'use client';

/**
 * P14.3-bis.NotesLegacyMerge — wrapper "Notes" sur fiche prospect.
 *
 * 'use client' : useState pour le drawer open/close share entre
 * ProspectQuickNoteForm (lien "Voir historique") et ProspectTimelineDrawer
 * (rendered en mode CONTROLLED, sans trigger interne).
 *
 * Remplace l ancienne <NotesEditor> qui editait `prospects.notes` (text
 * field plat, deprecated par 0086). Le contenu historique est desormais
 * la premiere entree timeline (migration 0086).
 */

import { useState } from 'react';
import type { TimelineEntry, ProspectContactLite } from '@/lib/admin/prospects/timeline-helpers';
import { ProspectQuickNoteForm } from './ProspectQuickNoteForm';
import { ProspectTimelineDrawer } from './ProspectTimelineDrawer';

type Props = {
  prospectId: string;
  companyName: string;
  initialTimeline: TimelineEntry[];
  contacts: ProspectContactLite[];
  currentUserId: string;
  currentUserRole: 'admin' | 'sales' | 'super_admin';
};

export function ProspectMainSection({
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
    <>
      <ProspectQuickNoteForm
        prospectId={prospectId}
        noteCount={noteCount}
        onOpenDrawer={() => setOpen(true)}
      />
      <ProspectTimelineDrawer
        prospectId={prospectId}
        companyName={companyName}
        initialTimeline={initialTimeline}
        contacts={contacts}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
