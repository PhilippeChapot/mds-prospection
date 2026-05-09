import { describe, it, expect } from 'vitest';
import { renderAdminAcomptePayeEmail, renderAdminConciergePayeEmail } from './admin-payment';

const baseParams = {
  prospectId: 'p1',
  prospectUrl: 'https://app.test/admin/prospects/p1',
  companyName: 'RCS Europe',
  contactEmail: 'audio@radiohouse.pro',
  amountEur: '7 630,00 €',
  documentNumber: 'D-20260509-02692',
  paymentType: 'concierge' as const,
  stripeSessionId: 'cs_test_xxx',
  stripePaymentIntentId: 'pi_test_xxx',
};

describe('admin payment templates (P4.x.1 Bug B)', () => {
  it('renderAdminAcomptePayeEmail (paymentType=acompte_30pct) : subject "Acompte 30% encaissé"', () => {
    const tpl = renderAdminAcomptePayeEmail({ ...baseParams, paymentType: 'acompte_30pct' });
    expect(tpl.subject).toContain('Acompte 30% encaissé');
    expect(tpl.subject).toContain('RCS Europe');
    expect(tpl.subject).toContain('7 630,00 €');
  });

  it('renderAdminConciergePayeEmail : subject "Lien concierge encaissé" (PAS Acompte 30%)', () => {
    const tpl = renderAdminConciergePayeEmail(baseParams);
    expect(tpl.subject).toContain('Lien concierge encaissé');
    expect(tpl.subject).not.toContain('Acompte 30%');
    expect(tpl.html).toContain('montant libre saisi côté admin');
  });

  it('concierge template inclut tjs companyName + amount + lien fiche prospect', () => {
    const tpl = renderAdminConciergePayeEmail(baseParams);
    expect(tpl.html).toContain('RCS Europe');
    expect(tpl.html).toContain('7 630,00 €');
    expect(tpl.html).toContain('https://app.test/admin/prospects/p1');
    expect(tpl.text).toContain('Paiement concierge encaisse');
  });
});
