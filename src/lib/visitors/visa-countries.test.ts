/**
 * @vitest-environment node
 *
 * P15.1.VisitorModel — tests helper isLowRiskCountry.
 */
import { describe, it, expect } from 'vitest';
import { isLowRiskCountry, VISA_LOW_RISK_COUNTRIES } from './visa-countries';

describe('isLowRiskCountry (P15.1)', () => {
  it('renvoie true pour un pays UE/anglo/asie développée', () => {
    expect(isLowRiskCountry('FR')).toBe(true);
    expect(isLowRiskCountry('US')).toBe(true);
    expect(isLowRiskCountry('JP')).toBe(true);
  });

  it('est insensible à la casse et aux espaces', () => {
    expect(isLowRiskCountry('fr')).toBe(true);
    expect(isLowRiskCountry('  gb ')).toBe(true);
  });

  it('renvoie false pour un pays hors liste', () => {
    expect(isLowRiskCountry('RU')).toBe(false);
    expect(isLowRiskCountry('CN')).toBe(false);
  });

  it('renvoie false pour null/undefined/vide', () => {
    expect(isLowRiskCountry(null)).toBe(false);
    expect(isLowRiskCountry(undefined)).toBe(false);
    expect(isLowRiskCountry('')).toBe(false);
  });

  it('la liste contient les 27 UE + EFTA + anglo + asie (>= 38 entrées)', () => {
    expect(VISA_LOW_RISK_COUNTRIES.size).toBeGreaterThanOrEqual(38);
  });
});
