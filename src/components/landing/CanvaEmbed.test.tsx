/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a — sanity test embed Canva.
 * P6.x.4-a-quinquies — URL Canva différenciée par locale.
 */

import { describe, it, expect } from 'vitest';
import { CanvaEmbed, CANVA_URLS } from './CanvaEmbed';
import { renderI18n } from './__test-helpers__/i18n-render';

describe('CanvaEmbed (P6.x.4-a / quinquies)', () => {
  it('iframe lazy-loaded, allow=fullscreen', () => {
    const { container } = renderI18n(<CanvaEmbed />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('allow')).toBe('fullscreen');
  });

  it('P6.x.4-a-quinquies — locale=fr → URL Canva FR (DAHJ3nuKMro)', () => {
    const { container } = renderI18n(<CanvaEmbed />, { locale: 'fr' });
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(CANVA_URLS.fr);
    expect(iframe?.getAttribute('src')).toContain('DAHJ3nuKMro');
  });

  it('P6.x.4-a-quinquies — locale=en → URL Canva EN (DAHJ31nTEq0)', () => {
    const { container } = renderI18n(<CanvaEmbed />, { locale: 'en' });
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(CANVA_URLS.en);
    expect(iframe?.getAttribute('src')).toContain('DAHJ31nTEq0');
  });

  it('renders the FR section heading "Découvrir MediaDays en image"', () => {
    const { getByText } = renderI18n(<CanvaEmbed />, { locale: 'fr' });
    expect(getByText(/Découvrir MediaDays en image/)).toBeTruthy();
  });

  it('renders the EN section heading "Discover MediaDays in pictures"', () => {
    const { getByText } = renderI18n(<CanvaEmbed />, { locale: 'en' });
    expect(getByText(/Discover MediaDays in pictures/)).toBeTruthy();
  });
});
