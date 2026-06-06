/**
 * P13.x — anti-regression : le rebrand sed P11.x avait ecrase
 * SIGNUP_CATEGORIES en ['partenaire', 'partenaire'] (collision). Le fix
 * #70 puis le hotfix P13.x ont restaure ['partenaire', 'sponsor'] dans
 * les 2 fichiers d enum (lib/signup/schema + admin/signups/types).
 *
 * Ce test garantit qu il n y a JAMAIS de collision et que les deux
 * sources de verite restent alignees.
 */

import { describe, it, expect } from 'vitest';
import { SIGNUP_CATEGORIES as SCHEMA_CATEGORIES } from './schema';
import { SIGNUP_CATEGORIES as ADMIN_CATEGORIES } from '@/app/admin/(authenticated)/signups/types';

describe('SIGNUP_CATEGORIES regression (P13.x)', () => {
  it('schema enum contient exactement partenaire + sponsor', () => {
    expect([...SCHEMA_CATEGORIES].sort()).toEqual(['partenaire', 'sponsor']);
  });

  it('admin signups enum contient exactement partenaire + sponsor', () => {
    expect([...ADMIN_CATEGORIES].sort()).toEqual(['partenaire', 'sponsor']);
  });

  it('les 2 enums sont strictement alignes (zero collision)', () => {
    expect([...SCHEMA_CATEGORIES].sort()).toEqual([...ADMIN_CATEGORIES].sort());
    // Pas de doublon dans l un ou l autre.
    expect(new Set(SCHEMA_CATEGORIES).size).toBe(SCHEMA_CATEGORIES.length);
    expect(new Set(ADMIN_CATEGORIES).size).toBe(ADMIN_CATEGORIES.length);
  });
});
