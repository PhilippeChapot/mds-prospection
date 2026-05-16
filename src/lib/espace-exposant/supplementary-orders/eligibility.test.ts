/**
 * P6.x.1b-α — tests canAccessSupplementaryOrders.
 */

import { describe, it, expect } from 'vitest';
import { canAccessSupplementaryOrders } from './eligibility';

describe('canAccessSupplementaryOrders', () => {
  it('refuses null prospect', () => {
    const r = canAccessSupplementaryOrders(null);
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reasonCode).toBe('no_prospect');
  });

  it('refuses prospect not yet signed', () => {
    const r = canAccessSupplementaryOrders({ status: 'devis_envoye', signed_at: null });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reasonCode).toBe('not_signed');
  });

  it('refuses lead', () => {
    const r = canAccessSupplementaryOrders({ status: 'lead', signed_at: null });
    expect(r.eligible).toBe(false);
  });

  it('accepts prospect status=signe with signed_at', () => {
    const r = canAccessSupplementaryOrders({
      status: 'signe',
      signed_at: '2026-04-01T12:00:00Z',
    });
    expect(r.eligible).toBe(true);
  });

  it('accepts prospect status=acompte_paye with signed_at', () => {
    const r = canAccessSupplementaryOrders({
      status: 'acompte_paye',
      signed_at: '2026-04-01T12:00:00Z',
    });
    expect(r.eligible).toBe(true);
  });

  it('accepts prospect status=paye_integral with signed_at', () => {
    const r = canAccessSupplementaryOrders({
      status: 'paye_integral',
      signed_at: '2026-04-01T12:00:00Z',
    });
    expect(r.eligible).toBe(true);
  });

  it('refuses signed_at present but status=perdu (rare edge case)', () => {
    const r = canAccessSupplementaryOrders({
      status: 'perdu',
      signed_at: '2026-04-01T12:00:00Z',
    });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reasonCode).toBe('wrong_status');
  });
});
