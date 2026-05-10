/**
 * P5.x.5 — verifie que les 4 templates Resend appliquent capitalizeName
 * sur firstName a l'affichage. Le helper capitalizeName (lib/format/name.ts)
 * a deja ses propres tests d'edge cases ; ici on assert juste qu'il est
 * branche cote rendu.
 */

import { describe, it, expect } from 'vitest';
import { renderEspaceExposantMagicLinkTemplate } from './espace-exposant-magic-link';
import { renderProspectAcomptePaymentLinkTemplate } from './prospect-acompte-paymentlink';
import { renderDoiTemplate } from './doi';
import { renderDevisConciergeTemplate } from './devis-concierge';

describe('capitalize firstName dans templates Resend (P5.x.5)', () => {
  it('espace-exposant-magic-link FR : "phil" -> "Phil"', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('fr', {
      firstName: 'phil',
      magicLinkUrl: 'https://x/y',
      requestPageUrl: 'https://x/z',
    });
    expect(tpl.html).toContain('Bonjour Phil');
    expect(tpl.html).not.toContain('Bonjour phil');
    expect(tpl.text).toContain('Bonjour Phil');
  });

  it('espace-exposant-magic-link EN : "phil" -> "Phil"', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('en', {
      firstName: 'phil',
      magicLinkUrl: 'https://x/y',
      requestPageUrl: 'https://x/z',
    });
    expect(tpl.html).toContain('Hi Phil');
  });

  it('prospect-acompte-paymentlink : compose "jean-pierre" -> "Jean-Pierre"', () => {
    const tpl = renderProspectAcomptePaymentLinkTemplate('fr', {
      firstName: 'jean-pierre',
      companyName: 'Acme',
      documentNumber: 'D-1',
      sellsyDocumentUrl: 'https://x/y',
      paymentLinkUrl: 'https://x/z',
      acompteAmount: '100 €',
    });
    expect(tpl.html).toContain('Bonjour Jean-Pierre');
  });

  it('doi : "MARIE" -> "Marie" (lowercase puis cap)', () => {
    const tpl = renderDoiTemplate('fr', {
      firstName: 'MARIE',
      doiUrl: 'https://x/verify',
    });
    expect(tpl.html).toContain('Bonjour Marie');
    expect(tpl.html).not.toContain('Bonjour MARIE');
  });

  it('devis-concierge : "édouard" -> "Édouard"', () => {
    const tpl = renderDevisConciergeTemplate('fr', {
      firstName: 'édouard',
      companyName: 'Acme',
      documentNumber: 'D-1',
      sellsyDocumentUrl: 'https://x/y',
      totalHt: '1 000 €',
    });
    expect(tpl.html).toContain('Bonjour Édouard');
  });

  it('doi EN : "phil" -> "Hello Phil" (capitalize aussi en EN)', () => {
    const tpl = renderDoiTemplate('en', {
      firstName: 'phil',
      doiUrl: 'https://x/verify',
    });
    expect(tpl.html).toContain('Hello Phil');
    expect(tpl.html).not.toContain('Hello phil');
  });
});
