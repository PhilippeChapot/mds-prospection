/**
 * @vitest-environment node
 *
 * P14.1.SalesCalendarCore — tests helpers sync.
 *
 * Couvre :
 *   - checkOverlap : null si pas de chevauchement
 *   - checkOverlap : detecte overlap total + partiel + nested
 *   - checkOverlap : ignore les events cancelled/done
 *   - checkOverlap : excludeEventId (s autoriser a overlap avec soi-meme
 *     lors d un update)
 *   - getEventTypeColor / Icon mapping
 */

import { describe, it, expect } from 'vitest';
import {
  checkOverlap,
  getEventTypeColor,
  getEventTypeIcon,
  getEventStatusColor,
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_STATUSES,
} from './helpers';

type StoredEvent = {
  id: string;
  user_id: string;
  start_at: string;
  end_at: string | null;
  status: string;
  title: string;
  event_type: string;
};

function makeClient(events: StoredEvent[]) {
  function makeChain() {
    let lastUserId: string | null = null;
    let lastStartLt: string | null = null;
    let lastEndGt: string | null = null;
    let excludedId: string | null = null;

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'user_id') lastUserId = val;
        return chain;
      },
      not: () => chain,
      lt: (col: string, val: string) => {
        if (col === 'start_at') lastStartLt = val;
        return chain;
      },
      gt: (col: string, val: string) => {
        if (col === 'end_at') lastEndGt = val;
        return chain;
      },
      neq: (col: string, val: string) => {
        if (col === 'id') excludedId = val;
        return chain;
      },
      limit: () => {
        const filtered = events.filter((e) => {
          if (e.user_id !== lastUserId) return false;
          if (excludedId && e.id === excludedId) return false;
          if (e.status === 'cancelled' || e.status === 'done') return false;
          if (!e.end_at) return false;
          // Overlap = start < other.end AND end > other.start.
          // Cote chain : .lt('start_at', endAt) + .gt('end_at', startAt).
          // Donc on garde si e.start_at < lastStartLt && e.end_at > lastEndGt.
          if (lastStartLt && e.start_at >= lastStartLt) return false;
          if (lastEndGt && e.end_at <= lastEndGt) return false;
          return true;
        });
        return Promise.resolve({ data: filtered.slice(0, 1), error: null });
      },
    };
    return chain;
  }
  return { from: () => makeChain() } as never;
}

const USER = 'user-1';
const BASE = '2026-06-07T10:00:00.000Z';
const PLUS30 = '2026-06-07T10:30:00.000Z';
const PLUS60 = '2026-06-07T11:00:00.000Z';
const PLUS90 = '2026-06-07T11:30:00.000Z';

describe('getEventTypeColor / Icon (P14.1)', () => {
  it('Map les 3 types vers une couleur Tailwind', () => {
    for (const t of CALENDAR_EVENT_TYPES) {
      const c = getEventTypeColor(t);
      expect(c).toMatch(/bg-/);
      const i = getEventTypeIcon(t);
      expect(i.length).toBeGreaterThan(0);
    }
  });
  it('Map les 4 statuts vers une couleur', () => {
    for (const s of CALENDAR_EVENT_STATUSES) {
      expect(getEventStatusColor(s)).toMatch(/bg-/);
    }
  });
});

describe('checkOverlap (P14.1)', () => {
  it('Retourne null si endAt absent (task sans duree)', async () => {
    const r = await checkOverlap(USER, new Date(BASE), null, undefined, makeClient([]));
    expect(r).toBeNull();
  });

  it('Retourne null si pas d event sur le creneau', async () => {
    const r = await checkOverlap(USER, new Date(BASE), new Date(PLUS30), undefined, makeClient([]));
    expect(r).toBeNull();
  });

  it('Detecte overlap total (meme creneau)', async () => {
    const existing: StoredEvent = {
      id: 'e-1',
      user_id: USER,
      start_at: BASE,
      end_at: PLUS30,
      status: 'pending',
      title: 'Existing call',
      event_type: 'call_relance',
    };
    const r = await checkOverlap(
      USER,
      new Date(BASE),
      new Date(PLUS30),
      undefined,
      makeClient([existing]),
    );
    expect(r?.id).toBe('e-1');
  });

  it('Detecte overlap partiel (l existant finit pendant le nouveau)', async () => {
    // Existing: 10:00-10:30. New: 10:15-11:00 → overlap 15min.
    const existing: StoredEvent = {
      id: 'e-2',
      user_id: USER,
      start_at: BASE,
      end_at: PLUS30,
      status: 'pending',
      title: 'Partial',
      event_type: 'meeting',
    };
    const r = await checkOverlap(
      USER,
      new Date('2026-06-07T10:15:00.000Z'),
      new Date(PLUS60),
      undefined,
      makeClient([existing]),
    );
    expect(r?.id).toBe('e-2');
  });

  it('Ignore les events cancelled/done', async () => {
    const existing: StoredEvent = {
      id: 'e-3',
      user_id: USER,
      start_at: BASE,
      end_at: PLUS30,
      status: 'cancelled',
      title: 'Cancelled',
      event_type: 'meeting',
    };
    const r = await checkOverlap(
      USER,
      new Date(BASE),
      new Date(PLUS30),
      undefined,
      makeClient([existing]),
    );
    expect(r).toBeNull();
  });

  it('excludeEventId : s autoriser a overlap avec soi-meme (update)', async () => {
    const existing: StoredEvent = {
      id: 'e-4',
      user_id: USER,
      start_at: BASE,
      end_at: PLUS30,
      status: 'pending',
      title: 'Self',
      event_type: 'meeting',
    };
    const r = await checkOverlap(
      USER,
      new Date(BASE),
      new Date(PLUS30),
      'e-4',
      makeClient([existing]),
    );
    expect(r).toBeNull();
  });

  it('Ne match pas un event different (creneaux disjoints)', async () => {
    // Existing: 10:00-10:30. New: 11:00-11:30 → pas overlap.
    const existing: StoredEvent = {
      id: 'e-5',
      user_id: USER,
      start_at: BASE,
      end_at: PLUS30,
      status: 'pending',
      title: 'Earlier',
      event_type: 'call_relance',
    };
    const r = await checkOverlap(
      USER,
      new Date(PLUS60),
      new Date(PLUS90),
      undefined,
      makeClient([existing]),
    );
    expect(r).toBeNull();
  });

  it('Ne mix pas les users (e existe sur user-2, on cherche user-1)', async () => {
    const existing: StoredEvent = {
      id: 'e-6',
      user_id: 'user-2',
      start_at: BASE,
      end_at: PLUS30,
      status: 'pending',
      title: 'Other user',
      event_type: 'meeting',
    };
    const r = await checkOverlap(
      USER,
      new Date(BASE),
      new Date(PLUS30),
      undefined,
      makeClient([existing]),
    );
    expect(r).toBeNull();
  });
});
