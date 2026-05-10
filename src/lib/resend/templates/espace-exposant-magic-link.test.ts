/**
 * P5.x.2 — tests template magic-link Espace Exposant.
 */

import { describe, it, expect } from 'vitest';
import { renderEspaceExposantMagicLinkTemplate } from './espace-exposant-magic-link';

const baseParams = {
  firstName: 'Marie',
  magicLinkUrl: 'https://www.mediadays.solutions/fr/espace-exposant/login?token=eyJ.foo.bar',
  requestPageUrl: 'https://www.mediadays.solutions/fr/espace-exposant',
};

describe('espace-exposant-magic-link template (P5.x.2)', () => {
  it('FR : sujet, CTA, mention 15min', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('fr', baseParams);
    expect(tpl.subject).toContain('Espace Exposant');
    expect(tpl.html).toContain('Bonjour Marie');
    expect(tpl.html).toContain('Accéder à mon Espace Exposant');
    expect(tpl.html).toContain('15 minutes');
    expect(tpl.html).toContain(baseParams.magicLinkUrl);
    expect(tpl.text).toContain(baseParams.magicLinkUrl);
  });

  it('EN : sujet, CTA, mention 15min', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('en', baseParams);
    expect(tpl.subject).toContain('Exhibitor Portal');
    expect(tpl.html).toContain('Hi Marie');
    expect(tpl.html).toContain('Access my Exhibitor Portal');
    expect(tpl.html).toContain('15 minutes');
    expect(tpl.text).toContain(baseParams.magicLinkUrl);
  });

  it('echappe les caracteres HTML dangereux dans firstName', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('fr', {
      ...baseParams,
      firstName: '<script>alert(1)</script>',
    });
    expect(tpl.html).not.toContain('<script>alert(1)</script>');
    expect(tpl.html).toContain('&lt;script&gt;');
  });

  it('mentionne la requestPageUrl pour redemander un lien', () => {
    const tpl = renderEspaceExposantMagicLinkTemplate('fr', baseParams);
    expect(tpl.html).toContain(baseParams.requestPageUrl);
    expect(tpl.text).toContain(baseParams.requestPageUrl);
  });
});
