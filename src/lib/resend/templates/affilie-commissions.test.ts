/**
 * @vitest-environment node
 *
 * P7.x.1.C — tests templates affilie-commission-validated + paid.
 */

import { describe, it, expect } from 'vitest';
import { renderAffilieCommissionValidated } from './affilie-commission-validated';
import { renderAffilieCommissionPaid } from './affilie-commission-paid';

describe('renderAffilieCommissionValidated (P7.x.1.C)', () => {
  it('rend subject + html + text avec montant formate EUR FR', () => {
    const tpl = renderAffilieCommissionValidated({
      affilieName: 'lucas aubrée',
      prospectCompany: 'Acme Media',
      amountEurHt: 250,
      dashboardUrl: 'https://mediadays.solutions/fr/affilie',
    });
    expect(tpl.subject).toMatch(/Votre commission de 250,00\s?€ est validée/);
    // capitalize prenom
    expect(tpl.html).toMatch(/Bonjour Lucas Aubrée/);
    // mention prospect + montant
    expect(tpl.html).toMatch(/Acme Media/);
    expect(tpl.html).toMatch(/250,00\s?€ HT/);
    // CTA vers dashboard paiements
    expect(tpl.html).toMatch(/\/fr\/affilie\/dashboard\/paiements/);
    expect(tpl.html).toMatch(/\/fr\/affilie\/dashboard\/profil/);
  });

  it('HTML escape company name (injection defense)', () => {
    const tpl = renderAffilieCommissionValidated({
      affilieName: 'jean',
      prospectCompany: '<script>alert(1)</script>',
      amountEurHt: 100,
      dashboardUrl: 'https://example.com',
    });
    expect(tpl.html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(tpl.html).toMatch(/&lt;script&gt;/);
  });
});

describe('renderAffilieCommissionPaid (P7.x.1.C)', () => {
  it('subject inclut montant + reference virement', () => {
    const tpl = renderAffilieCommissionPaid({
      affilieName: 'Lucas',
      amountEurHt: 250,
      paidAt: '2026-05-21T10:00:00Z',
      paymentReference: 'VIR-2026-05-21-001',
      iban: 'FR7630001007941234567890185',
      dashboardUrl: 'https://mediadays.solutions/fr/affilie',
    });
    expect(tpl.subject).toMatch(/Virement effectué/);
    expect(tpl.subject).toMatch(/250,00\s?€/);
    expect(tpl.subject).toMatch(/VIR-2026-05-21-001/);
  });

  it('html contient IBAN MASQUÉ (pas en clair)', () => {
    const tpl = renderAffilieCommissionPaid({
      affilieName: 'Lucas',
      amountEurHt: 250,
      paidAt: '2026-05-21T10:00:00Z',
      paymentReference: 'VIR-001',
      iban: 'FR7630001007941234567890185',
      dashboardUrl: 'https://example.com',
    });
    // IBAN masque present (4 first + stars + 4 last)
    expect(tpl.html).toMatch(/FR76 \*+/);
    expect(tpl.html).toMatch(/0185/);
    // IBAN brut NON present
    expect(tpl.html).not.toMatch(/FR7630001007941234567890185/);
    expect(tpl.text).toMatch(/FR76 \*+/);
    expect(tpl.text).not.toMatch(/FR7630001007941234567890185/);
  });

  it('iban null -> "—" dans le rendu', () => {
    const tpl = renderAffilieCommissionPaid({
      affilieName: 'Lucas',
      amountEurHt: 250,
      paidAt: '2026-05-21T10:00:00Z',
      paymentReference: 'VIR-001',
      iban: null,
      dashboardUrl: 'https://example.com',
    });
    expect(tpl.html).toMatch(/—/);
  });
});
