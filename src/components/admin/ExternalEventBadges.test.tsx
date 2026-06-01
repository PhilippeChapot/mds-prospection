/**
 * @vitest-environment jsdom
 *
 * P5.x.ExternalEvents — tests rendu ExternalEventBadges.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExternalEventBadges } from './ExternalEventBadges';

describe('ExternalEventBadges', () => {
  it('renders null when tags vide ou null', () => {
    const { container: c1 } = render(<ExternalEventBadges tags={null} />);
    const { container: c2 } = render(<ExternalEventBadges tags={{}} />);
    expect(c1.firstChild).toBeNull();
    expect(c2.firstChild).toBeNull();
  });

  it('renders 1 badge par event present (years aggrege)', () => {
    const { container } = render(
      <ExternalEventBadges tags={{ prs: [2026], mediadays_classic: [2023, 2025] }} />,
    );
    const badges = container.querySelectorAll('[data-slot="badge"]');
    expect(badges).toHaveLength(2);
  });

  it('ordre fixe : PRS, MD Classic, RDE, SATIS, CBD', () => {
    const { container } = render(
      <ExternalEventBadges tags={{ cbd: [2025], rde: [2026], satis: [2025], prs: [2026] }} />,
    );
    const badges = container.querySelectorAll('[data-slot="badge"]');
    const texts = Array.from(badges).map((b) => b.textContent ?? '');
    expect(texts[0]).toContain('PRS');
    expect(texts[1]).toContain('RDE');
    expect(texts[2]).toContain('SATIS');
    expect(texts[3]).toContain('CBD');
  });

  it('ignore les clefs inconnues', () => {
    const { container } = render(<ExternalEventBadges tags={{ unknown_event: [2025] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('ignore les years non-numériques', () => {
    const { container } = render(<ExternalEventBadges tags={{ prs: ['not-a-year', 'foo'] }} />);
    expect(container.firstChild).toBeNull();
  });
});
