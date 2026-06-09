'use client';

/**
 * P14.4.ProspectTimelineAutoEntries — chip coloré pour une auto-entry.
 *
 * 'use client' : tooltip/hover + link externe possibles.
 *
 * UX : entry plus compact qu une note manuelle (chip 1 ligne + emoji),
 * pour donner l info "il s est passe X il y a Y" sans bloater le drawer.
 */

import { formatTimeAgo } from '@/lib/utils/format-time-ago';
import type { TimelineEntry, AutoEntryKind } from '@/lib/admin/prospects/timeline-helpers';

type Props = { entry: TimelineEntry };

/**
 * Mapping AutoEntryKind → meta visuel. Couleur via Tailwind class strings
 * (statiques pour permettre la purge correcte).
 */
const KIND_META: Record<AutoEntryKind, { emoji: string; bg: string; fg: string }> = {
  status_changed: { emoji: '📊', bg: 'bg-md-blue-light', fg: 'text-md-blue-dark' },
  owner_changed: { emoji: '🎯', bg: 'bg-purple-100', fg: 'text-purple-800' },
  pack_changed: { emoji: '📦', bg: 'bg-indigo-100', fg: 'text-indigo-800' },
  booth_assigned: { emoji: '🏛️', bg: 'bg-amber-100', fg: 'text-amber-800' },
  booth_cleared: { emoji: '🚪', bg: 'bg-gray-100', fg: 'text-gray-700' },
  stand_assigned: { emoji: '🏛️', bg: 'bg-amber-100', fg: 'text-amber-800' },
  prospect_booths_changed: { emoji: '🏛️', bg: 'bg-pink-100', fg: 'text-pink-800' },
  affiliate_company_attached: { emoji: '🤝', bg: 'bg-teal-100', fg: 'text-teal-800' },
  affiliate_company_detached: { emoji: '🔌', bg: 'bg-gray-100', fg: 'text-gray-700' },
  quote_emit_success: { emoji: '📄', bg: 'bg-md-magenta/10', fg: 'text-md-magenta' },
  stripe_payment_received: { emoji: '💳', bg: 'bg-green-100', fg: 'text-green-800' },
  signup_converted: { emoji: '🌐', bg: 'bg-md-blue-light', fg: 'text-md-blue-dark' },
  sellsy_client_resolved: { emoji: '🔗', bg: 'bg-sky-100', fg: 'text-sky-800' },
  company_sellsy_link_set: { emoji: '🔗', bg: 'bg-emerald-100', fg: 'text-emerald-800' },
  company_sellsy_link_removed: { emoji: '🔓', bg: 'bg-gray-100', fg: 'text-gray-700' },
  unknown: { emoji: '·', bg: 'bg-gray-100', fg: 'text-gray-700' },
};

function getExternalLink(entry: TimelineEntry): string | null {
  const kind = entry.auto_kind;
  const payload = entry.auto_payload ?? {};
  if (kind === 'quote_emit_success') {
    return (payload as { public_url?: string }).public_url ?? null;
  }
  if (kind === 'signup_converted') {
    const signupId = (payload as { signup_id?: string }).signup_id;
    return signupId ? `/admin/signups/${signupId}` : null;
  }
  return null;
}

export function AutoEntryChip({ entry }: Props) {
  const kind = entry.auto_kind ?? 'unknown';
  const meta = KIND_META[kind];
  const actorLabel = entry.actor ? entry.actor.full_name?.trim() || entry.actor.email : 'Système';
  const link = getExternalLink(entry);

  const inner = (
    <span
      className={`${meta.bg} ${meta.fg} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium`}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span>{entry.content}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-baseline gap-2 px-1 py-1.5">
      {link ? (
        link.startsWith('/') ? (
          <a href={link} className="hover:opacity-80">
            {inner}
          </a>
        ) : (
          <a href={link} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
            {inner}
          </a>
        )
      ) : (
        inner
      )}
      <span className="text-md-text-muted text-[11px]">
        · {actorLabel} · <time dateTime={entry.event_at}>{formatTimeAgo(entry.event_at)}</time>
      </span>
    </div>
  );
}
