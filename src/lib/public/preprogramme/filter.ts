/**
 * P16.x.PreProgrammeInteractive — logique de filtrage pure (testable sans
 * rendu/URL). Utilisée par le composant client PreProgrammeInteractive.
 */

import type { PreProgrammeConference } from './types';

export interface PreProgrammeFilters {
  /** 'all' | 'mds' | 'prs' */
  track: string;
  /** codes pôles (multi, OU logique). */
  poles: string[];
  /** types conférence (multi, OU logique). */
  types: string[];
  /** recherche texte libre. */
  q: string;
}

export function filterConferences(
  conferences: PreProgrammeConference[],
  f: PreProgrammeFilters,
): PreProgrammeConference[] {
  const q = f.q.trim().toLowerCase();
  return conferences.filter((c) => {
    if (f.track === 'mds' && c.track !== 'mds_solutions') return false;
    if (f.track === 'prs' && c.track !== 'prs_radio_audio') return false;
    if (f.poles.length > 0 && !f.poles.some((code) => c.poles.some((p) => p.code === code))) {
      return false;
    }
    if (f.types.length > 0 && (!c.conferenceType || !f.types.includes(c.conferenceType))) {
      return false;
    }
    if (q) {
      const haystack = [c.title, c.description, c.targetAudience, ...c.keyFigures]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export interface PoleCount {
  code: string;
  name: string;
  colorHex: string;
  count: number;
}

export function derivePoleCounts(conferences: PreProgrammeConference[]): PoleCount[] {
  const map = new Map<string, PoleCount>();
  for (const c of conferences) {
    for (const p of c.poles) {
      const cur = map.get(p.code);
      if (cur) cur.count += 1;
      else map.set(p.code, { code: p.code, name: p.name, colorHex: p.colorHex, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export interface TypeCount {
  type: string;
  count: number;
}

export function deriveTypeCounts(conferences: PreProgrammeConference[]): TypeCount[] {
  const map = new Map<string, number>();
  for (const c of conferences) {
    if (c.conferenceType) map.set(c.conferenceType, (map.get(c.conferenceType) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function findConferenceBySlug(
  conferences: PreProgrammeConference[],
  slug: string,
): PreProgrammeConference | null {
  return conferences.find((c) => c.slug === slug) ?? null;
}
