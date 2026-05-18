/**
 * @vitest-environment node
 *
 * P6.x.5-nonies — tests template "Devis mis à jour" (ré-émission).
 */

import { describe, it, expect } from 'vitest';
import { renderProspectDevisUpdated } from './prospect-devis-updated';

const baseParams = {
  firstName: 'jean-marc',
  companyName: 'Acme Media',
  newDevisNumber: 'D-20260519-00010',
  oldDevisNumber: 'D-20260518-02702',
  newTotalTtc: '13 740,00 €',
  newDevisUrl: 'https://sellsy.example/d/abc',
  senderEmail: 'philippe@mediadays.solutions',
};

describe('renderProspectDevisUpdated', () => {
  it('FR — sujet inclut le nouveau numéro et body cite l’ancien devis annulé', () => {
    const tpl = renderProspectDevisUpdated('fr', baseParams);
    expect(tpl.subject).toBe('[MDS 2026] Votre devis a été mis à jour — D-20260519-00010');
    // capitalisation du prénom
    expect(tpl.html).toContain('Bonjour Jean-Marc');
    expect(tpl.text).toContain('Bonjour Jean-Marc');
    // mention de l'ancien devis annulé
    expect(tpl.html).toContain('D-20260518-02702');
    expect(tpl.html).toContain('annulé');
    // CTA vers nouveau devis
    expect(tpl.html).toContain('https://sellsy.example/d/abc');
    expect(tpl.html).toContain('13 740,00 €');
    // adresse sender
    expect(tpl.html).toContain('philippe@mediadays.solutions');
  });

  it('EN — sujet anglais et corps EN si locale=en', () => {
    const tpl = renderProspectDevisUpdated('en', { ...baseParams, firstName: 'sarah' });
    expect(tpl.subject).toBe('[MDS 2026] Your quote has been updated — D-20260519-00010');
    expect(tpl.html).toContain('Hi Sarah');
    expect(tpl.text).toContain('Hi Sarah');
    expect(tpl.html).toContain('cancelled');
    expect(tpl.html).toContain('D-20260518-02702');
    // Pas de "Bonjour" ni "annulé" français
    expect(tpl.html).not.toContain('Bonjour');
  });

  it('FR — fallback wording si oldDevisNumber=null', () => {
    const tpl = renderProspectDevisUpdated('fr', { ...baseParams, oldDevisNumber: null });
    expect(tpl.html).toContain("L'ancien devis est annulé");
    expect(tpl.text).toContain("L'ancien devis est annulé");
  });

  it('HTML est échappé contre injection (companyName avec <script>)', () => {
    const tpl = renderProspectDevisUpdated('fr', {
      ...baseParams,
      companyName: '<script>alert(1)</script>',
    });
    expect(tpl.html).not.toContain('<script>alert(1)</script>');
    expect(tpl.html).toContain('&lt;script&gt;');
  });
});
