import { describe, it, expect } from 'vitest';
import { paymentPathToDocumentType } from './create-document';

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
