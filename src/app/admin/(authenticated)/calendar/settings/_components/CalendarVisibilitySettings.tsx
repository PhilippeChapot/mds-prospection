'use client';

/**
 * P14.5.CalendarCollaboration — section visibilité croisée des calendriers.
 *
 * Permet de cocher les collègues dont on veut voir le calendrier.
 * La visibilité est symétrique côté UI mais stockée sens unique en DB
 * (user_id = moi, visible_user_id = collègue).
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { AdminUserSummary } from '@/lib/admin/calendar/collaboration-actions';
import { toggleCalendarVisibilityAction } from '@/lib/admin/calendar/collaboration-actions';

interface Props {
  allUsers: AdminUserSummary[];
  initialVisibleUserIds: string[];
}

export function CalendarVisibilitySettings({ allUsers, initialVisibleUserIds }: Props) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set(initialVisibleUserIds));
  const [pending, startTransition] = useTransition();

  function handleToggle(userId: string) {
    startTransition(async () => {
      const r = await toggleCalendarVisibilityAction({ visible_user_id: userId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setVisibleIds((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    });
  }

  if (allUsers.length === 0) {
    return <div className="text-md-text-muted text-sm">Aucun autre collaborateur disponible.</div>;
  }

  return (
    <div className="space-y-2">
      {allUsers.map((u) => (
        <label
          key={u.id}
          className="hover:bg-muted/40 flex cursor-pointer items-center justify-between rounded-md border border-transparent p-2 transition"
        >
          <span className="text-sm">
            {u.full_name ?? u.email}
            <span className="text-md-text-muted ml-1.5 text-xs">({u.role})</span>
          </span>
          <input
            type="checkbox"
            disabled={pending}
            checked={visibleIds.has(u.id)}
            onChange={() => handleToggle(u.id)}
            className="size-4"
          />
        </label>
      ))}
      <p className="text-md-text-muted pt-1 text-xs">
        Cocher un collègue affiche ses évènements dans votre vue calendrier.
      </p>
    </div>
  );
}
