/**
 * P6.x.1a-quinquies — tests helper mds-filter.
 */

import { describe, it, expect } from 'vitest';
import { isMdsReference, MDS_PRODUCT_PREFIX, MDS_REFERENCE_ILIKE_PATTERN } from './mds-filter';

describe('isMdsReference (case-insensitive)', () => {
  it('match MDS- en majuscules', () => {
    expect(isMdsReference('MDS-PACK-STANDARD-PARIS')).toBe(true);
  });

  it('match mds- en minuscules', () => {
    expect(isMdsReference('mds-pack-standard')).toBe(true);
  });

  it('match Mds- mixed case', () => {
    expect(isMdsReference('Mds-Addon-Logo')).toBe(true);
  });

  it('reject reference sans prefixe', () => {
    expect(isMdsReference('HF-LIVRE-001')).toBe(false);
    expect(isMdsReference('RH-PUB-RADIO')).toBe(false);
    expect(isMdsReference('LLP-ABONNEMENT')).toBe(false);
  });

  it('reject null / undefined / empty', () => {
    expect(isMdsReference(null)).toBe(false);
    expect(isMdsReference(undefined)).toBe(false);
    expect(isMdsReference('')).toBe(false);
  });

  it('reject prefix partiel sans tiret', () => {
    expect(isMdsReference('MDSPACKSTANDARD')).toBe(false);
  });

  it('expose les constantes MDS_PRODUCT_PREFIX + MDS_REFERENCE_ILIKE_PATTERN', () => {
    expect(MDS_PRODUCT_PREFIX).toBe('MDS-');
    expect(MDS_REFERENCE_ILIKE_PATTERN).toBe('MDS-%');
  });
});
