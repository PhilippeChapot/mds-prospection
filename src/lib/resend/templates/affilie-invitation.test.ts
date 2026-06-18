/**
 * @vitest-environment node
 *
 * P5.x.AffiliateInvitationEmail — tests buildAffiliateInvitationEmail.
 */

import { describe, it, expect } from 'vitest';
import { buildAffiliateInvitationEmail } from './affilie-invitation';

const BASE = {
  displayName: 'eric dupont',
  token: 'ERIC_DUPONT',
  commissionPercent: 10,
  espaceLoginUrl: 'https://www.mediadays.solutions/fr/affilie',
  trackingUrl: 'https://www.mediadays.solutions/fr/inscription-partenaire?ref=ERIC_DUPONT',
} as const;

describe('buildAffiliateInvitationEmail', () => {
  describe('locale=fr', () => {
    it('sujet contient le displayName capitalisé', () => {
      const { subject } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(subject).toContain('Eric Dupont');
    });

    it('html contient le token', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(html).toContain('ERIC_DUPONT');
    });

    it('html contient le commission_percent', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(html).toContain('10%');
    });

    it('html contient un <a> vers espaceLoginUrl (CTA)', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(html).toContain(`href="${BASE.espaceLoginUrl}"`);
    });

    it('html affiche la trackingUrl en clair (lien selectable)', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(html).toContain(BASE.trackingUrl);
    });

    it('text contient le token', () => {
      const { text } = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(text).toContain('ERIC_DUPONT');
    });

    it('retourne subject + html + text', () => {
      const tpl = buildAffiliateInvitationEmail({ ...BASE, locale: 'fr' });
      expect(tpl.subject).toBeTruthy();
      expect(tpl.html).toBeTruthy();
      expect(tpl.text).toBeTruthy();
    });
  });

  describe('locale=en', () => {
    it('sujet anglais contient le displayName capitalisé', () => {
      const { subject } = buildAffiliateInvitationEmail({ ...BASE, locale: 'en' });
      expect(subject).toContain('Eric Dupont');
      expect(subject.toLowerCase()).toContain('welcome');
    });

    it('html EN contient le token', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'en' });
      expect(html).toContain('ERIC_DUPONT');
    });

    it('html EN contient commission_percent', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'en' });
      expect(html).toContain('10%');
    });

    it('html EN contient un <a> vers espaceLoginUrl', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'en' });
      expect(html).toContain(`href="${BASE.espaceLoginUrl}"`);
    });

    it('html EN affiche la trackingUrl en clair', () => {
      const { html } = buildAffiliateInvitationEmail({ ...BASE, locale: 'en' });
      expect(html).toContain(BASE.trackingUrl);
    });
  });

  it('escaping HTML — display_name avec < > & ne casse pas le html', () => {
    const { html } = buildAffiliateInvitationEmail({
      ...BASE,
      displayName: '<script>alert(1)</script>',
      locale: 'fr',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
