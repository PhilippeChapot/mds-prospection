import { describe, it, expect } from 'vitest';
import {
  renderAdminSignupConvertiEmail,
  renderAdminSignatureFinaleEmail,
  renderAdminSyncErrorEmail,
} from './admin-notifications';

describe('renderAdminSignupConvertiEmail', () => {
  it('subject inclut le nom de la societe', () => {
    const tpl = renderAdminSignupConvertiEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: '21 Juin Production',
      contactEmail: 'jdoe@21juin.fr',
      contactName: 'Jean Doe',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      packCode: 'ACCESS',
      paymentPath: 'devis_sepa',
      estimatedAmountEur: '1 980,00 €',
      language: 'FR',
      addonCount: 2,
    });
    expect(tpl.subject).toContain('21 Juin Production');
    expect(tpl.subject).toContain('[MDS]');
    expect(tpl.html).toContain('https://app.test/admin/prospects/abc');
    expect(tpl.html).toContain('1 980,00 €');
    expect(tpl.text).toContain('Jean Doe');
  });
});

describe('renderAdminSyncErrorEmail', () => {
  it('subject + html contiennent provider et company', () => {
    const tpl = renderAdminSyncErrorEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: 'ACME Radio',
      provider: 'sellsy',
      errorMessage: 'Sellsy fetch /opportunities failed (400)',
      context: 'syncProspectToSellsy after 3 retries',
    });
    expect(tpl.subject).toContain('sellsy');
    expect(tpl.subject).toContain('ACME Radio');
    expect(tpl.html).toContain('Sellsy fetch /opportunities failed (400)');
    expect(tpl.html).toContain('syncProspectToSellsy after 3 retries');
  });

  it('escape les caracteres HTML dans le message d erreur', () => {
    const tpl = renderAdminSyncErrorEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: 'ACME Radio',
      provider: 'brevo',
      errorMessage: '<script>alert(1)</script>',
    });
    expect(tpl.html).not.toContain('<script>alert');
    expect(tpl.html).toContain('&lt;script&gt;');
  });
});

describe('renderAdminSignupConvertiEmail Cas B', () => {
  it('utilise un subject distinct "Manifestation d intérêt"', () => {
    const tpl = renderAdminSignupConvertiEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: 'Radio House',
      contactEmail: 'audio@radiohouse.pro',
      contactName: 'Marie Dupuis',
      pole: 'AUDIO_RADIO',
      category: 'standard',
      packCode: null,
      paymentPath: null,
      estimatedAmountEur: '0,00 €',
      language: 'FR',
      addonCount: 0,
      isCasB: true,
      presenceType: 'visiteur',
    });
    expect(tpl.subject).toContain('Manifestation');
    expect(tpl.subject).toContain('Radio House');
    expect(tpl.html).toContain('rappel admin sous 48h');
    expect(tpl.html).toContain('visiteur');
    expect(tpl.text).toContain('Cas B');
  });

  it("Cas A par defaut : conserve le subject 'Nouveau prospect converti'", () => {
    const tpl = renderAdminSignupConvertiEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: 'ACME',
      contactEmail: 'a@acme.test',
      contactName: 'A B',
      pole: 'AUDIO_RADIO',
      category: 'prs_exhibitor',
      packCode: 'ACCESS',
      paymentPath: 'devis_sepa',
      estimatedAmountEur: '1 980,00 €',
      language: 'FR',
      addonCount: 0,
      // isCasB non fourni
    });
    expect(tpl.subject).toContain('Nouveau prospect converti');
  });
});

describe('renderAdminSignatureFinaleEmail', () => {
  it('inclut numero devis et lien Sellsy', () => {
    const tpl = renderAdminSignatureFinaleEmail({
      prospectUrl: 'https://app.test/admin/prospects/abc',
      companyName: 'ACME',
      documentNumber: 'D-20260507-00042',
      amountEur: '7 630,00 €',
      sellsyDocumentUrl: 'https://www.sellsy.com/docs/123',
    });
    expect(tpl.subject).toContain('Devis signé');
    expect(tpl.html).toContain('D-20260507-00042');
    expect(tpl.html).toContain('https://www.sellsy.com/docs/123');
  });
});
