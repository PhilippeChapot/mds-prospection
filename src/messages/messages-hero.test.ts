/**
 * @vitest-environment node
 *
 * P6.x.4-a-decies — verifie le wording "NOUVEAU" / "NEW" dans le hero
 * (clef home.tagline) en FR et EN. Garde-fou contre une regression du
 * messaging brand (Phil veut le mot en MAJUSCULES).
 */

import { describe, it, expect } from 'vitest';
import frMessages from './fr.json';
import enMessages from './en.json';

describe('home.tagline (P6.x.4-a-decies)', () => {
  it('FR — contient "NOUVEAU" (majuscules) et plus "français"', () => {
    expect(frMessages.home.tagline).toMatch(/NOUVEAU/);
    expect(frMessages.home.tagline).not.toMatch(/français/);
  });

  it('EN — contient "NEW" (majuscules) et plus "French media industry"', () => {
    expect(enMessages.home.tagline).toMatch(/\bNEW\b/);
    expect(enMessages.home.tagline).not.toMatch(/French media industry/);
  });
});
