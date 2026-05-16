/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a — sanity test embed Canva.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanvaEmbed } from './CanvaEmbed';

describe('CanvaEmbed (P6.x.4-a)', () => {
  it('renders the Canva iframe lazy-loaded with the expected URL', () => {
    const { container } = render(<CanvaEmbed />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toContain('canva.com/design/DAHJ3nuKMro');
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('allow')).toBe('fullscreen');
  });

  it('renders the section heading "Découvrir MediaDays en image"', () => {
    const { getByText } = render(<CanvaEmbed />);
    expect(getByText(/Découvrir MediaDays en image/)).toBeTruthy();
  });
});
