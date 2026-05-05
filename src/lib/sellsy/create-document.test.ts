import { describe, it, expect } from 'vitest';
import {
  endpointForDocumentType,
  formatAmount,
  paymentPathToDocumentType,
} from './create-document';

describe('paymentPathToDocumentType', () => {
  it('maps devis_sepa -> estimate', () => {
    expect(paymentPathToDocumentType('devis_sepa')).toBe('estimate');
  });

  it('maps devis_acompte_stripe -> estimate (devis avec acompte Stripe en M4)', () => {
    expect(paymentPathToDocumentType('devis_acompte_stripe')).toBe('estimate');
  });

  it('maps proforma_acompte -> proforma', () => {
    expect(paymentPathToDocumentType('proforma_acompte')).toBe('proforma');
  });

  it('maps facture_integrale -> invoice', () => {
    expect(paymentPathToDocumentType('facture_integrale')).toBe('invoice');
  });

  it('falls back to estimate for null / unknown', () => {
    expect(paymentPathToDocumentType(null)).toBe('estimate');
    expect(paymentPathToDocumentType(undefined)).toBe('estimate');
    expect(paymentPathToDocumentType('xxx')).toBe('estimate');
  });
});

describe('endpointForDocumentType', () => {
  it('routes type -> Sellsy V2 endpoint', () => {
    expect(endpointForDocumentType('estimate')).toBe('/estimates');
    expect(endpointForDocumentType('proforma')).toBe('/proformas');
    expect(endpointForDocumentType('invoice')).toBe('/invoices');
  });
});

describe('formatAmount (Sellsy V2 string format)', () => {
  it('formats integer EUR with 2 decimals', () => {
    expect(formatAmount(1980)).toBe('1980.00');
  });
  it('formats half-decimal correctly', () => {
    expect(formatAmount(1980.5)).toBe('1980.50');
  });
  it('formats arbitrary decimals (rounds to 2)', () => {
    expect(formatAmount(1980.567)).toBe('1980.57');
  });
  it('formats zero', () => {
    expect(formatAmount(0)).toBe('0.00');
  });
});
