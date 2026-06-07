/**
 * @vitest-environment node
 *
 * P5.x.PhoneEnrichmentDisplay — tests helpers normalisation + format.
 */

import { describe, it, expect } from 'vitest';
import { normalizePhoneE164, formatPhoneForDisplay, parsePhone } from './phone-format';

describe('normalizePhoneE164 (P5.x.PhoneEnrichmentDisplay)', () => {
  it('FR national 10 chiffres avec espaces', () => {
    expect(normalizePhoneE164('01 42 36 78 90')).toBe('+33142367890');
  });
  it('FR national 10 chiffres collés', () => {
    expect(normalizePhoneE164('0142367890')).toBe('+33142367890');
  });
  it('FR avec +33 et espaces', () => {
    expect(normalizePhoneE164('+33 1 42 36 78 90')).toBe('+33142367890');
  });
  it('FR 33XXXXXXXXX sans +', () => {
    expect(normalizePhoneE164('33142367890')).toBe('+33142367890');
  });
  it('FR 9 chiffres (sans 0) → +33', () => {
    expect(normalizePhoneE164('142367890')).toBe('+33142367890');
  });
  it('International +44 conservé', () => {
    expect(normalizePhoneE164('+442079460958')).toBe('+442079460958');
  });
  it('International +1 USA conservé', () => {
    expect(normalizePhoneE164('+1 (415) 555-0123')).toBe('+14155550123');
  });
  it('null / undefined / vide / "NULL" → null', () => {
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164('   ')).toBeNull();
    expect(normalizePhoneE164('NULL')).toBeNull();
  });
  it('Garbage / trop court → null', () => {
    expect(normalizePhoneE164('abc')).toBeNull();
    expect(normalizePhoneE164('12345')).toBeNull();
    expect(normalizePhoneE164('5551234')).toBeNull(); // 7 chiffres = ambigu
  });

  // P5.x.PhoneEnrichmentDisplay-bis : country codes nus.
  it('ES sans + : "34699248200" → "+34699248200"', () => {
    expect(normalizePhoneE164('34699248200')).toBe('+34699248200');
  });
  it('DE sans + avec espaces : "49 1514 2613393" → "+4915142613393"', () => {
    expect(normalizePhoneE164('49 1514 2613393')).toBe('+4915142613393');
  });
  it('IL sans + : "972 9 744 0055" → "+97297440055"', () => {
    expect(normalizePhoneE164('972 9 744 0055')).toBe('+97297440055');
  });
  it('UK sans + : "44 20 7946 0958" → "+442079460958"', () => {
    expect(normalizePhoneE164('44 20 7946 0958')).toBe('+442079460958');
  });
  it('Garbage 123456 reste null (pas faussement detecte)', () => {
    expect(normalizePhoneE164('123456')).toBeNull();
  });
  it('FR 9 chiffres prioritaire sur prefix NANP (default fr=33)', () => {
    // 142367890 commence par "1" (NANP) mais c est 9 chiffres → on
    // priorise FR (defaultCountryCode=33) plutot que NANP +1+8chiffres.
    expect(normalizePhoneE164('142367890')).toBe('+33142367890');
  });
});

describe('formatPhoneForDisplay (P5.x.PhoneEnrichmentDisplay)', () => {
  it('+33 → "01 42 36 78 90"', () => {
    expect(formatPhoneForDisplay('+33142367890')).toBe('01 42 36 78 90');
  });
  it('+44 → "+44 20 79 46 09 58"', () => {
    expect(formatPhoneForDisplay('+442079460958')).toBe('+44 20 79 46 09 58');
  });
  it('null → null', () => {
    expect(formatPhoneForDisplay(null)).toBeNull();
    expect(formatPhoneForDisplay(undefined)).toBeNull();
  });
});

describe('parsePhone (round-trip)', () => {
  it('Round-trip FR garde la info', () => {
    const r = parsePhone('01.42.36.78.90');
    expect(r.e164).toBe('+33142367890');
    expect(r.display).toBe('01 42 36 78 90');
  });
  it('Round-trip null', () => {
    const r = parsePhone(null);
    expect(r.e164).toBeNull();
    expect(r.display).toBeNull();
  });
});
