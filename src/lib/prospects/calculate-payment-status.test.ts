import { describe, it, expect } from 'vitest';
import { calculatePaymentStatus } from './calculate-payment-status';

describe('calculatePaymentStatus (P4.x.2 sujet C)', () => {
  it('paid 30% du TTC -> acompte_paye', () => {
    expect(calculatePaymentStatus(2746.8, 9156)).toBe('acompte_paye');
  });

  it('paid 100% exact -> paye_integral', () => {
    expect(calculatePaymentStatus(9156, 9156)).toBe('paye_integral');
  });

  it('paid 100% avec arrondi 1 centime en moins -> paye_integral (tolerance)', () => {
    expect(calculatePaymentStatus(9155.99, 9156)).toBe('paye_integral');
  });

  it('paid 83% concierge custom -> acompte_paye (pas paye_integral)', () => {
    expect(calculatePaymentStatus(7630, 9156)).toBe('acompte_paye');
  });

  it('paid > 100% (sur-paiement) -> paye_integral', () => {
    expect(calculatePaymentStatus(10000, 9156)).toBe('paye_integral');
  });

  it('devisTotalTtc null -> conservateur acompte_paye', () => {
    expect(calculatePaymentStatus(9156, null)).toBe('acompte_paye');
  });

  it('devisTotalTtc 0 -> conservateur acompte_paye', () => {
    expect(calculatePaymentStatus(100, 0)).toBe('acompte_paye');
  });

  it('paid 0 (pas de paiement) -> acompte_paye (utilise via le caller, ne devrait pas etre appele)', () => {
    expect(calculatePaymentStatus(0, 9156)).toBe('acompte_paye');
  });
});
