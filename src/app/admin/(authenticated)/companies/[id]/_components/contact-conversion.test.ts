/**
 * @vitest-environment node
 *
 * P5.x.CompanyContactsConvertedBadge — contactConversionLink.
 */

import { describe, it, expect } from 'vitest';
import { contactConversionLink } from './contact-conversion';

describe('contactConversionLink (P5.x)', () => {
  it('contact converti → badge vers la fiche prospect', () => {
    const r = contactConversionLink({ id: 'c1', latest_prospect_id: 'p9' });
    expect(r).toEqual({ converted: true, href: '/admin/prospects/p9', label: '✓ Converti' });
  });

  it('contact non converti → lien Convertir', () => {
    const r = contactConversionLink({ id: 'c1', latest_prospect_id: null });
    expect(r.converted).toBe(false);
    expect(r.href).toBe('/admin/prospects/new?contact_id=c1');
    expect(r.label).toBe('Convertir');
  });
});
