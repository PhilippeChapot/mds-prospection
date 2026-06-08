/**
 * @vitest-environment node
 *
 * P14.3.ProspectTimelineDrawer — tests format-time-ago.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeAgo } from './format-time-ago';

describe('formatTimeAgo (P14.3)', () => {
  beforeEach(() => {
    // Fige Date.now() pour rendre les assertions deterministes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('Date il y a 2 min → format relatif FR contient "min"', () => {
    const d = new Date('2026-06-08T11:58:00.000Z');
    expect(formatTimeAgo(d)).toMatch(/min/);
  });

  it('Date il y a 2h → format relatif FR contient "heure"', () => {
    const d = new Date('2026-06-08T10:00:00.000Z');
    expect(formatTimeAgo(d)).toMatch(/heure/);
  });

  it('Date < 7j → format relatif (pas la date absolue)', () => {
    const d = new Date('2026-06-05T12:00:00.000Z'); // -3j
    const r = formatTimeAgo(d);
    expect(r).not.toMatch(/\d{4}/); // pas d annee
  });

  it('Date >= 7j → format absolu (contient annee)', () => {
    const d = new Date('2026-05-15T12:00:00.000Z'); // -24j
    const r = formatTimeAgo(d);
    expect(r).toMatch(/2026/);
  });

  it('Date dans le futur → "in X minutes" (n est pas le cas typique mais ne throw pas)', () => {
    const d = new Date('2026-06-08T12:05:00.000Z'); // +5min
    expect(() => formatTimeAgo(d)).not.toThrow();
  });

  it('String ISO accepte aussi bien que Date', () => {
    const r = formatTimeAgo('2026-06-08T11:55:00.000Z');
    expect(r).toMatch(/min/);
  });

  it('Date invalide → "—"', () => {
    expect(formatTimeAgo('not-a-date')).toBe('—');
  });

  it('Locale en passe par enGB', () => {
    const d = new Date('2026-06-08T11:55:00.000Z');
    const r = formatTimeAgo(d, 'en');
    expect(r).toMatch(/minute/i);
  });
});
