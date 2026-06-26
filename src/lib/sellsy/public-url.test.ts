/**
 * @vitest-environment node
 *
 * P5.x.SellsyInvoiceCreationFixes (Fix 3) — extractSellsyPublicUrl.
 */

import { describe, it, expect } from 'vitest';
import { extractSellsyPublicUrl } from './public-url';

describe('extractSellsyPublicUrl', () => {
  it('shape réelle Sellsy V2 : public_link objet { enabled, url } → renvoie url', () => {
    expect(
      extractSellsyPublicUrl({
        public_link: { enabled: true, url: 'https://sellsy.link/abc' },
        pdf_link: 'https://file.sellsy.com/?id=BROKEN',
      }),
    ).toBe('https://sellsy.link/abc');
  });

  it('objet { enabled:false } → ignore url, tombe sur pdf_link', () => {
    expect(
      extractSellsyPublicUrl({
        public_link: { enabled: false, url: 'https://sellsy.link/abc' },
        pdf_link: 'https://file.sellsy.com/?id=PDF',
      }),
    ).toBe('https://file.sellsy.com/?id=PDF');
  });

  it('shape plate legacy : public_link string + public_link_enabled true → renvoie string', () => {
    expect(
      extractSellsyPublicUrl({
        public_link: 'https://sellsy.example/d/1',
        public_link_enabled: true,
      }),
    ).toBe('https://sellsy.example/d/1');
  });

  it('string + public_link_enabled false → tombe sur pdf_link', () => {
    expect(
      extractSellsyPublicUrl({
        public_link: 'https://sellsy.example/d/1',
        public_link_enabled: false,
        pdf_link: 'https://file.sellsy.com/?id=PDF',
      }),
    ).toBe('https://file.sellsy.com/?id=PDF');
  });

  it('aucun lien public → null (pas de pdf_link)', () => {
    expect(extractSellsyPublicUrl({})).toBeNull();
    expect(extractSellsyPublicUrl(null)).toBeNull();
  });

  it('objet sans url valide → pdf_link en dernier recours', () => {
    expect(extractSellsyPublicUrl({ public_link: { enabled: true }, pdf_link: 'https://p' })).toBe(
      'https://p',
    );
  });
});
