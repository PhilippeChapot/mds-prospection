import { describe, it, expect } from 'vitest';
import { renderProspectAcomptePaymentLinkTemplate } from './prospect-acompte-paymentlink';

const baseParams = {
  firstName: 'Marie',
  documentNumber: 'D-20260509-02695',
  sellsyDocumentUrl: 'https://www.sellsy.com/document/52437695',
  paymentLinkUrl: 'https://buy.stripe.com/test_xxx',
  acompteAmount: '2 747 €',
  resteDuAmount: '6 409 €',
};

describe('prospect_acompte_paymentlink template (P4.x.4 Bug L)', () => {
  it('FR avec companyName : affiche "pour <company>" avec un point apres', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('fr', {
      ...baseParams,
      companyName: 'RCS Europe',
    });
    expect(tpl.html).toContain('pour <strong>RCS Europe</strong>.');
    expect(tpl.html).not.toContain('pour <strong></strong>');
    expect(tpl.html).not.toContain('pour .');
    expect(tpl.text).toContain('pour RCS Europe.');
  });

  it('FR sans companyName : reformule sans "pour" pour eviter "pour ." en suspens', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('fr', {
      ...baseParams,
      companyName: '',
    });
    // Phrase alternative : "votre devis MediaDays Solutions 2026."
    expect(tpl.html).not.toContain('pour .');
    expect(tpl.html).not.toContain('pour <strong></strong>');
    expect(tpl.html).toContain('votre devis MediaDays Solutions 2026');
    expect(tpl.text).not.toContain('pour .');
  });

  it('FR companyName avec espaces seulement : meme fallback', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('fr', {
      ...baseParams,
      companyName: '   ',
    });
    expect(tpl.html).not.toContain('pour <strong>');
  });

  it('EN avec companyName : "for <company>."', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('en', {
      ...baseParams,
      companyName: 'RCS Europe',
    });
    expect(tpl.html).toContain('for <strong>RCS Europe</strong>.');
    expect(tpl.text).toContain('for RCS Europe is ready.');
  });

  it('EN sans companyName : reformule sans "for" en suspens', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('en', {
      ...baseParams,
      companyName: '',
    });
    expect(tpl.html).not.toContain('for <strong></strong>');
    expect(tpl.html).not.toContain('for .');
    expect(tpl.text).toContain('quote is ready');
  });
});
