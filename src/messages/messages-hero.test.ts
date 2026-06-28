/**
 * @vitest-environment node
 *
 * Lot 1 — verifie le wording du hero (clef home.tagline + home.body) en FR
 * et EN. Garde-fou contre une regression du messaging brand.
 *
 * Historique :
 *   P6.x.4-a-decies — vérifiait "NOUVEAU" / "NEW" (wording précédent).
 *   Lot 1 — nouveau wording "Le Paris Radio Show s'enrichit avec MediaDays Solutions".
 */

import { describe, it, expect } from 'vitest';
import frMessages from './fr.json';
import enMessages from './en.json';

describe('home.tagline (Lot 1)', () => {
  it('FR — contient "Paris Radio Show" et "MediaDays Solutions"', () => {
    expect(frMessages.home.tagline).toContain('Paris Radio Show');
    expect(frMessages.home.tagline).toContain('MediaDays Solutions');
  });

  it('EN — contient "Paris Radio Show" et "MediaDays Solutions"', () => {
    expect(enMessages.home.tagline).toContain('Paris Radio Show');
    expect(enMessages.home.tagline).toContain('MediaDays Solutions');
  });

  it('FR — home.body present et contient "Un seul rendez-vous"', () => {
    expect(frMessages.home.body).toBeTruthy();
    expect(frMessages.home.body).toContain('Un seul rendez-vous');
  });

  it('EN — home.body present et contient "One single event"', () => {
    expect(enMessages.home.body).toBeTruthy();
    expect(enMessages.home.body).toContain('One single event');
  });
});
