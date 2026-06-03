/**
 * P5.x.2 — tests template magic-link Espace Partenaire.
 */

import { describe, it, expect } from 'vitest';
import { renderEspacePartenaireMagicLinkTemplate } from './espace-partenaire-magic-link';

const baseParams = {
  firstName: 'Marie',
  magicLinkUrl: 'https://www.mediadays.solutions/fr/espace-partenaire/login?token=eyJ.foo.bar',
  requestPageUrl: 'https://www.mediadays.solutions/fr/espace-partenaire',
};

describe('espace-partenaire-magic-link template (P5.x.2)', () => {
  it('FR : sujet, CTA, mention 15min', () => {
    const tpl = renderEspacePartenaireMagicLinkTemplate('fr', baseParams);
    expect(tpl.subject).toContain('Espace Partenaire');
    expect(tpl.html).toContain('Bonjour Marie');
    expect(tpl.html).toContain('Accéder à mon Espace Partenaire');
    expect(tpl.html).toContain('15 minutes');
    expect(tpl.html).toContain(baseParams.magicLinkUrl);
    expect(tpl.text).toContain(baseParams.magicLinkUrl);
  });

  it('EN : sujet, CTA, mention 15min', () => {
    const tpl = renderEspacePartenaireMagicLinkTemplate('en', baseParams);
    expect(tpl.subject).toContain('Partner Portal');
    expect(tpl.html).toContain('Hi Marie');
    expect(tpl.html).toContain('Access my Partner Portal');
    expect(tpl.html).toContain('15 minutes');
    expect(tpl.text).toContain(baseParams.magicLinkUrl);
  });

  it('echappe les caracteres HTML dangereux dans firstName', () => {
    const tpl = renderEspacePartenaireMagicLinkTemplate('fr', {
      ...baseParams,
      firstName: '<script>alert(1)</script>',
    });
    expect(tpl.html).not.toContain('<script>alert(1)</script>');
    expect(tpl.html).toContain('&lt;script&gt;');
  });

  it('mentionne la requestPageUrl pour redemander un lien', () => {
    const tpl = renderEspacePartenaireMagicLinkTemplate('fr', baseParams);
    expect(tpl.html).toContain(baseParams.requestPageUrl);
    expect(tpl.text).toContain(baseParams.requestPageUrl);
  });
});
