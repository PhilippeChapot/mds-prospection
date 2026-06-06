/**
 * P13.x.Phase2 — anti-regression doctrine timezone Europe/Paris.
 *
 * Verifie que les helpers formatParisDateTime / formatParisDate /
 * formatParisTime appliquent bien le timeZone Europe/Paris.
 *
 * Cas test : date fixe 2026-06-06T12:00:00Z (UTC).
 *   - Paris en juin = CEST = UTC+2 -> 14:00 attendu.
 *   - Le serveur Vercel tourne en UTC, le client en local-tz.
 *   - Si le helper oublie le timeZone, on aurait 12:00 sur serveur et
 *     14:00 sur client -> React #418 hydration mismatch (incident
 *     reference burger menu #59).
 *
 * Ces tests servent egalement de garde pour qu un futur refactor ne
 * casse pas la doctrine.
 */

import { describe, it, expect } from 'vitest';
import { formatParisDateTime, formatParisDate, formatParisTime, APP_TIME_ZONE } from './dates';

const PARIS_NOON_CEST = '2026-06-06T12:00:00Z'; // = 14:00 Paris (CEST)
const PARIS_NOON_CET = '2026-12-06T12:00:00Z'; // = 13:00 Paris (CET)

describe('formatParisDateTime (P13.x.Phase2)', () => {
  it('APP_TIME_ZONE constant = "Europe/Paris"', () => {
    expect(APP_TIME_ZONE).toBe('Europe/Paris');
  });

  it('CEST (juin) : 12:00 UTC -> 14:00 Paris', () => {
    const out = formatParisDateTime(PARIS_NOON_CEST, 'fr', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(out).toContain('14:00');
  });

  it('CET (decembre) : 12:00 UTC -> 13:00 Paris', () => {
    const out = formatParisDateTime(PARIS_NOON_CET, 'fr', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(out).toContain('13:00');
  });

  it('locale en utilise en-GB et garde Europe/Paris', () => {
    const out = formatParisDateTime(PARIS_NOON_CEST, 'en', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(out).toContain('14:00');
  });
});

describe('formatParisDate (P13.x.Phase2)', () => {
  it('date 2026-06-06 reste 06 juin meme si UTC -2h vers le 5', () => {
    // 2026-06-06T00:30:00Z = 2026-06-06T02:30:00+02:00 Paris (toujours le 6).
    const out = formatParisDate('2026-06-06T00:30:00Z', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    expect(out).toMatch(/06\/06\/2026/);
  });

  it('date 2026-06-05T23:30:00Z = 2026-06-06T01:30:00 Paris -> bascule au 6', () => {
    const out = formatParisDate('2026-06-05T23:30:00Z', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    expect(out).toMatch(/06\/06\/2026/);
  });
});

describe('formatParisTime (P13.x.Phase2)', () => {
  it('14:00 Paris en juin', () => {
    expect(formatParisTime(PARIS_NOON_CEST)).toContain('14:00');
  });
});
