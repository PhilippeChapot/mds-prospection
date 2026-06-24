/**
 * P14.x.RSVP-UI — helpers d'affichage RSVP (badges, récap, couleur planning).
 * Module pur (pas de 'use client') → réutilisable client + testable.
 */

import type { AttendeeRecord, AttendeeResponseStatus, CalendarEventType } from './helpers';

export const RSVP_BADGE: Record<
  AttendeeResponseStatus,
  { emoji: string; labelFr: string; labelEn: string; className: string }
> = {
  accepted: {
    emoji: '🟢',
    labelFr: 'Accepté',
    labelEn: 'Accepted',
    className: 'bg-green-100 text-green-800 border-green-300',
  },
  declined: {
    emoji: '🔴',
    labelFr: 'Refusé',
    labelEn: 'Declined',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
  tentative: {
    emoji: '🟠',
    labelFr: 'Peut-être',
    labelEn: 'Maybe',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  needsAction: {
    emoji: '⏳',
    labelFr: 'En attente',
    labelEn: 'Pending',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

export function statusOf(a: AttendeeRecord): AttendeeResponseStatus {
  return a.responseStatus ?? 'needsAction';
}

export interface RsvpSummary {
  total: number;
  accepted: number;
  declined: number;
  tentative: number;
  needsAction: number;
}

export function computeRsvpSummary(attendees: AttendeeRecord[] | null | undefined): RsvpSummary {
  const list = attendees ?? [];
  return {
    total: list.length,
    accepted: list.filter((a) => statusOf(a) === 'accepted').length,
    declined: list.filter((a) => statusOf(a) === 'declined').length,
    tentative: list.filter((a) => statusOf(a) === 'tentative').length,
    needsAction: list.filter((a) => statusOf(a) === 'needsAction').length,
  };
}

/** Ex: "3 invités · ✅ 1 accepté · 🟠 1 peut-être · ❌ 1 refusé · ⏳ 0 en attente". */
export function formatRsvpSummary(s: RsvpSummary, locale: 'fr' | 'en' = 'fr'): string {
  if (locale === 'en') {
    return `${s.total} attendee${s.total > 1 ? 's' : ''} · ✅ ${s.accepted} · 🟠 ${s.tentative} · ❌ ${s.declined} · ⏳ ${s.needsAction}`;
  }
  return `${s.total} invité${s.total > 1 ? 's' : ''} · ✅ ${s.accepted} accepté · 🟠 ${s.tentative} peut-être · ❌ ${s.declined} refusé · ⏳ ${s.needsAction} en attente`;
}

export interface RsvpColor {
  backgroundColor: string;
  borderColor: string;
  dot: string;
}

const PALETTE = {
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  yellow: '#eab308',
  grey: '#94a3b8',
  blue: '#3b82f6',
} as const;

function color(hex: string): RsvpColor {
  return { backgroundColor: `${hex}22`, borderColor: hex, dot: hex };
}

/**
 * Couleur de card planning selon l'état RSVP global. `null` = couleur par
 * défaut (event non-meeting, sans invités, ou état neutre).
 */
export function computeRsvpColor(
  attendees: AttendeeRecord[] | null | undefined,
  eventType: CalendarEventType,
): RsvpColor | null {
  if (eventType !== 'meeting' || !attendees || attendees.length === 0) return null;
  const s = computeRsvpSummary(attendees);

  if (s.accepted === s.total) return color(PALETTE.green); // 🟢 tous OK
  if (s.declined > 0 && s.accepted === 0) return color(PALETTE.red); // 🔴 tous refus
  if (s.declined > 0 && s.accepted > 0) return color(PALETTE.amber); // 🟠 mixed
  if (s.tentative > 0 && s.declined === 0) return color(PALETTE.yellow); // 🟡 peut-être
  if (s.needsAction === s.total) return color(PALETTE.grey); // ⚪ aucune réponse
  if (s.needsAction > 0 && s.accepted > 0) return color(PALETTE.blue); // 🔵 en cours
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Un invité en attente peut être relancé si invité depuis > 24h. */
export function canResendIndividual(a: AttendeeRecord, nowMs: number): boolean {
  if (statusOf(a) !== 'needsAction') return false;
  if (!a.sent_at) return false;
  return new Date(a.sent_at).getTime() + DAY_MS < nowMs;
}
