/**
 * Timeline-style des 10 dernieres activites pipeline (P5.x.6).
 * Lit ActivityEvent[] depuis lib/dashboard/queries.ts (audit_log
 * classifie en transitions metier). Composant purement presentationnel :
 * la classification + le `relativeLabel` sont calcules cote query
 * (Date.now() interdit pendant le render selon la regle ESLint
 * react-hooks/purity, cf. fix P5.x.2.bis dashboard partenaire).
 *
 * Mobile-first : empile en colonne, icone fixe a gauche, contenu flex.
 */

import Link from 'next/link';
import type { ActivityEvent, ActivityType } from '@/lib/dashboard/queries';

const TYPE_ICON: Record<ActivityType, string> = {
  prospect_created: '🆕',
  devis_emitted: '📝',
  devis_signed: '✍️',
  acompte_paid: '💳',
  lost: '❌',
  other: '·',
};

export function RecentActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-6 text-center text-sm shadow-sm">
        Aucune activité récente.
      </div>
    );
  }

  return (
    <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
      <ul className="divide-md-border divide-y">
        {events.map((event) => (
          <li key={event.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span aria-hidden className="text-lg leading-none">
                {TYPE_ICON[event.type]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-md-text text-sm font-semibold">{event.label}</span>
                  <span className="text-md-text-muted text-xs">{event.relativeLabel}</span>
                </div>
                {event.detail ? (
                  <p className="text-md-text-muted mt-0.5 truncate text-xs">
                    {event.prospectId ? (
                      <Link
                        href={`/admin/prospects/${event.prospectId}`}
                        className="hover:text-md-blue hover:underline"
                      >
                        {event.detail}
                      </Link>
                    ) : (
                      event.detail
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
