/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a — sanity test embed Canva.
 */

import { describe, it, expect } from 'vitest';
import { CanvaEmbed } from './CanvaEmbed';
import { renderI18n } from './__test-helpers__/i18n-render';

describe('CanvaEmbed (P6.x.4-a)', () => {
  it('renders the Canva iframe lazy-loaded with the expected URL', () => {
    const { container } = renderI18n(<CanvaEmbed />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toContain('canva.com/design/DAHJ3nuKMro');
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('allow')).toBe('fullscreen');
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
