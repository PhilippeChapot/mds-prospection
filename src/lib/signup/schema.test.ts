/**
 * P5.x.1 — tests Zod signupStep1Schema, focus sur les nouveaux champs
 * vatCountry / vatNumber / vatVerified.
 *
 * Ces tests garantissent que :
 *   - Un signup FR sans TVA UE passe (vat* a null)
 *   - Un signup DE avec TVA passe
 *   - Un vatCountry='UK' (Brexit) est rejete (pas dans EU_VAT_COUNTRIES)
 *   - vatNumber > 40 chars rejete
 */

import { describe, it, expect } from 'vitest';
import { signupStep1Schema } from './schema';

const baseValid = {
  email: 'test@radiohouse.pro',
  companyId: null,
  companyName: 'Radio House',
  companyCountry: 'FR' as const,
  firstName: 'Marie',
  lastName: 'Dupont',
  phone: null,
  affiliateInput: null,
  vatCountry: null,
  vatNumber: null,
  vatVerified: false,
  category: 'partenaire' as const,
  consentRgpd: true,
  consentMarketing: false,
  hcaptchaToken: null,
  honeypot: '',
  locale: 'fr' as const,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrer: null,
};

describe('signupStep1Schema VAT EU (P5.x.1)', () => {
  it('FR sans TVA passe', () => {
    const result = signupStep1Schema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it('DE avec TVA + vatVerified=true passe', () => {
    const result = signupStep1Schema.safeParse({
      ...baseValid,
      companyCountry: 'DE',
      vatCountry: 'DE',
      vatNumber: '123456789',
      vatVerified: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vatCountry).toBe('DE');
      expect(result.data.vatNumber).toBe('123456789');
      expect(result.data.vatVerified).toBe(true);
    }
  });

  it('vatCountry=UK rejete (pas dans EU_VAT_COUNTRIES post-Brexit)', () => {
    const result = signupStep1Schema.safeParse({
      ...baseValid,
      vatCountry: 'UK',
      vatNumber: '123',
    });
    expect(result.success).toBe(false);
  });

  it('vatCountry=GB rejete (Brexit, hors UE)', () => {
    const result = signupStep1Schema.safeParse({
      ...baseValid,
      vatCountry: 'GB',
      vatNumber: '123',
    });
    expect(result.success).toBe(false);
  });

  it('vatNumber trop long (>40) rejete', () => {
    const result = signupStep1Schema.safeParse({
      ...baseValid,
      vatCountry: 'IT',
      vatNumber: 'A'.repeat(50),
    });
    expect(result.success).toBe(false);
  });

  it('vatCountry=BE accepte (Belgique UE)', () => {
    const result = signupStep1Schema.safeParse({
      ...baseValid,
      vatCountry: 'BE',
      vatNumber: '0123456789',
      vatVerified: true,
    });
    expect(result.success).toBe(true);
  });
});
