import { describe, it, expect } from 'vitest';
import { isAutoliquidationApplicable, parseViesResponse, EU_COUNTRIES_NON_FR } from './verify';

describe('parseViesResponse (SOAP XML)', () => {
  it('extrait isValid=true + name + address', () => {
    const xml = `
      <env:Envelope xmlns:env="...">
        <env:Body>
          <ns2:checkVatResponse>
            <ns2:countryCode>BE</ns2:countryCode>
            <ns2:vatNumber>0445000000</ns2:vatNumber>
            <ns2:requestDate>2026-05-07+02:00</ns2:requestDate>
            <ns2:valid>true</ns2:valid>
            <ns2:name>ACME BVBA</ns2:name>
            <ns2:address>RUE DE LA LOI 1, 1000 BRUSSELS</ns2:address>
          </ns2:checkVatResponse>
        </env:Body>
      </env:Envelope>
    `;
    const r = parseViesResponse(xml);
    expect(r.isValid).toBe(true);
    expect(r.name).toBe('ACME BVBA');
    expect(r.address).toBe('RUE DE LA LOI 1, 1000 BRUSSELS');
  });

  it('isValid=false : name/address omis si --- (placeholder VIES)', () => {
    const xml = `<valid>false</valid><name>---</name><address>---</address>`;
    const r = parseViesResponse(xml);
    expect(r.isValid).toBe(false);
    expect(r.name).toBeUndefined();
    expect(r.address).toBeUndefined();
  });

  it('case-insensitive sur les tags', () => {
    const xml = `<Valid>True</Valid>`;
    const r = parseViesResponse(xml);
    expect(r.isValid).toBe(true);
  });
});

describe('isAutoliquidationApplicable', () => {
  it('FR + valid -> false (pas d autoliquidation en France)', () => {
    expect(isAutoliquidationApplicable('FR', 'valid')).toBe(false);
  });

  it('UE non-FR + valid -> true', () => {
    expect(isAutoliquidationApplicable('BE', 'valid')).toBe(true);
    expect(isAutoliquidationApplicable('DE', 'valid')).toBe(true);
    expect(isAutoliquidationApplicable('IT', 'valid')).toBe(true);
  });

  it('UE non-FR + invalid -> false (TVA 20% standard)', () => {
    expect(isAutoliquidationApplicable('BE', 'invalid')).toBe(false);
    expect(isAutoliquidationApplicable('BE', 'unverified')).toBe(false);
    expect(isAutoliquidationApplicable('BE', 'pending')).toBe(false);
    expect(isAutoliquidationApplicable('BE', null)).toBe(false);
  });

  it('hors UE + valid -> false (CH, US, UK post-Brexit)', () => {
    expect(isAutoliquidationApplicable('CH', 'valid')).toBe(false);
    expect(isAutoliquidationApplicable('US', 'valid')).toBe(false);
    expect(isAutoliquidationApplicable('GB', 'valid')).toBe(false);
  });

  it('null country -> false', () => {
    expect(isAutoliquidationApplicable(null, 'valid')).toBe(false);
    expect(isAutoliquidationApplicable(undefined, 'valid')).toBe(false);
  });

  it('case-insensitive sur le code pays', () => {
    expect(isAutoliquidationApplicable('be', 'valid')).toBe(true);
    expect(isAutoliquidationApplicable('be ', 'valid')).toBe(true);
  });

  it('liste UE non-FR couvre 26 pays (UE-27 sans FR)', () => {
    expect(EU_COUNTRIES_NON_FR.length).toBe(26);
    expect((EU_COUNTRIES_NON_FR as readonly string[]).includes('FR')).toBe(false);
  });
});
