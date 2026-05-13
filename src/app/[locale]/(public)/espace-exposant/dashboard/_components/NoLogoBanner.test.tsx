/**
 * @vitest-environment jsdom
 *
 * P5.x.18 — tests rendu NoLogoBanner.
 *
 * Garanties testees :
 *   - rend les 3 strings passes en props (title, description, cta)
 *   - le lien pointe vers la prop `uploadHref`
 *   - emoji 💡 present (decoratif aria-hidden, accessibilite)
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoLogoBanner } from './NoLogoBanner';

describe('NoLogoBanner (P5.x.18)', () => {
  it('rend title + description + CTA depuis les props', () => {
    render(
      <NoLogoBanner
        title="Ajoutez votre logo"
        description="Description test"
        ctaLabel="Ajouter mon logo"
        uploadHref="/fr/espace-exposant/dashboard/kit-communication#logo-uploader"
      />,
    );
    expect(screen.getByText('Ajoutez votre logo')).toBeInTheDocument();
    expect(screen.getByText('Description test')).toBeInTheDocument();
    expect(screen.getByText(/Ajouter mon logo/)).toBeInTheDocument();
  });

  it('le CTA pointe vers uploadHref avec ancre #logo-uploader', () => {
    render(
      <NoLogoBanner
        title="t"
        description="d"
        ctaLabel="Ajouter mon logo"
        uploadHref="/fr/espace-exposant/dashboard/kit-communication#logo-uploader"
      />,
    );
    const link = screen.getByText(/Ajouter mon logo/).closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/fr/espace-exposant/dashboard/kit-communication#logo-uploader',
    );
  });

  it('respecte un uploadHref en locale en', () => {
    render(
      <NoLogoBanner
        title="t"
        description="d"
        ctaLabel="Add my logo"
        uploadHref="/en/espace-exposant/dashboard/kit-communication#logo-uploader"
      />,
    );
    const link = screen.getByText(/Add my logo/).closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/en/espace-exposant/dashboard/kit-communication#logo-uploader',
    );
  });

  it("inclut l'emoji 💡 marque aria-hidden", () => {
    const { container } = render(
      <NoLogoBanner title="t" description="d" ctaLabel="cta" uploadHref="/x" />,
    );
    const emoji = container.querySelector('[aria-hidden="true"]');
    expect(emoji?.textContent).toContain('💡');
  });
});
