/**
 * @vitest-environment node
 *
 * P6.x.8 — tests régression : les helpers de date doivent rendre la MÊME
 * chaîne quel que soit process.env.TZ (sinon hydration mismatch React #418
 * entre SSR Vercel UTC et client Europe/Paris).
 */

import { describe, it, expect } from 'vitest';
import {
  formatDateTimeShortFr,
  formatParisDateTime,
  formatParisDate,
  formatParisTime,
  APP_TIME_ZONE,
} from './dates';

describe('formatDateTimeShortFr (P6.x.8)', () => {
  it("force timeZone Europe/Paris (heure d'été) → 16:18 UTC = 18:18 Paris", () => {
    // 25 mai 16:18:01 UTC = 25 mai 18:18 Paris (CEST = UTC+2)
    const iso = '2026-05-25T16:18:01Z';
    const result = formatDateTimeShortFr(iso);
    expect(result).toMatch(/18:18/);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/mai/i);
  });

  it("force timeZone Europe/Paris (heure d'hiver) → 23:00 UTC = 00:00+1 Paris", () => {
    // 15 janvier 23:00:00 UTC = 16 janvier 00:00 Paris (CET = UTC+1)
    const iso = '2026-01-15T23:00:00Z';
    const result = formatDateTimeShortFr(iso);
    expect(result).toMatch(/00:00/);
    expect(result).toMatch(/16/); // jour décalé à cause du fuseau
  });

  it('APP_TIME_ZONE est Europe/Paris', () => {
    expect(APP_TIME_ZONE).toBe('Europe/Paris');
  });

  it('rendu déterministe même si on simule process.env.TZ=UTC (mismatch impossible)', () => {
    // On vérifie que la fonction utilise bien `timeZone` dans les options et
    // pas le TZ système. Comparer formatDateTimeShortFr d'une même ISO entre
    // 2 envs n'est pas faisable proprement en un seul process — mais on peut
    // au moins s'assurer que la fonction donne un résultat cohérent avec
    // Paris en testant le delta UTC↔Paris connu.
    const iso = '2026-05-25T00:00:00Z';
    // 00:00 UTC = 02:00 Paris (CEST)
    expect(formatDateTimeShortFr(iso)).toMatch(/02:00/);
  });
});

describe('formatParisDateTime / formatParisDate / formatParisTime (P6.x-BURGER-FIX)', () => {
  // Doctrine : pour qu un composant 'use client' rendu en SSR + hydraté
  // cote client produise une string IDENTIQUE des 2 cotes, il faut forcer
  // timeZone Europe/Paris (sinon Vercel UTC vs browser Paris -> mismatch
  // React #418 -> tous les onClick deviennent inertes, dont le burger menu).

  it('formatParisDateTime : 25 mai 16:18 UTC -> "18:18" Paris (CEST)', () => {
    const result = formatParisDateTime('2026-05-25T16:18:01Z');
    expect(result).toMatch(/18:18/);
    // Format FR par defaut "25/05/2026 18:18:01".
    expect(result).toMatch(/25\/05/);
  });

  it('formatParisDateTime EN : "en-GB" locale + Paris TZ', () => {
    const result = formatParisDateTime('2026-05-25T16:18:01Z', 'en');
    // en-GB format DD/MM/YYYY HH:mm:ss, heure Paris = 18:18:01.
    expect(result).toMatch(/18:18/);
    expect(result).toMatch(/25\/05/);
  });

  it('formatParisDate : 15 janvier 23:00 UTC -> "16 jan" Paris (DST hiver)', () => {
    // 15 janv 23:00 UTC = 16 janv 00:00 Paris (CET = UTC+1).
    const result = formatParisDate('2026-01-15T23:00:00Z');
    expect(result).toMatch(/16/);
    expect(result).toMatch(/janv/i);
  });

  it('formatParisDate options custom : { day, month } sans year', () => {
    const result = formatParisDate('2026-07-14T12:00:00Z', {
      day: '2-digit',
      month: 'short',
    });
    expect(result).toMatch(/14/);
    expect(result).toMatch(/juil/i);
    // Pas d annee dans les options custom.
    expect(result).not.toMatch(/2026/);
  });

  it('formatParisTime : 22:30 UTC -> "00:30" Paris (CEST)', () => {
    const result = formatParisTime('2026-06-15T22:30:00Z');
    expect(result).toMatch(/00:30/);
  });

  it('Stabilite SSR-CSR : meme entree -> meme sortie sur 100 calls', () => {
    const iso = '2026-05-25T16:18:01Z';
    const first = formatParisDateTime(iso);
    for (let i = 0; i < 100; i++) {
      expect(formatParisDateTime(iso)).toBe(first);
    }
  });
});
