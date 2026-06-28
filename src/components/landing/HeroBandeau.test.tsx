/**
 * @vitest-environment jsdom
 *
 * Lot 2 — HeroBandeau : hero bandeau immersif avec 2 logos + CTA rose.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { HeroBandeau } from './HeroBandeau';
import { renderI18n } from './__test-helpers__/i18n-render';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { pathname: string; query?: Record<string, string> };
    children: React.ReactNode;
  } & React.HTMLAttributes<HTMLAnchorElement>) => {
    const url =
      typeof href === 'string'
        ? href
        : `${href.pathname}${
            href.query
              ? '?' +
                Object.entries(href.query)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('&')
              : ''
          }`;
    return (
      <a href={url} {...rest}>
        {children}
      </a>
    );
  },
}));

describe('HeroBandeau (Lot 2)', () => {
  it('rend les 2 logos : PRS (gauche) + MDS (droite)', () => {
    renderI18n(<HeroBandeau />);
    expect(screen.getByTestId('hero-bandeau-logo-prs')).toBeInTheDocument();
    expect(screen.getByTestId('hero-bandeau-logo-mds')).toBeInTheDocument();
  });

  it('logo MDS = MDSLogo_final_blanc_rond.svg (variante BLANC pour fond foncé)', () => {
    renderI18n(<HeroBandeau />);
    expect(screen.getByTestId('hero-bandeau-logo-mds')).toHaveAttribute(
      'src',
      '/brand/MDSLogo_final_blanc_rond.svg',
    );
  });

  it('logo PRS = PRS-LogoBlanc2026.svg (variante BLANC)', () => {
    renderI18n(<HeroBandeau />);
    expect(screen.getByTestId('hero-bandeau-logo-prs')).toHaveAttribute(
      'src',
      '/brand/PRS-LogoBlanc2026.svg',
    );
  });

  it('alt-texts accessibles (PRS + MDS)', () => {
    renderI18n(<HeroBandeau />);
    expect(screen.getByAltText('Paris Radio Show 2026')).toBeInTheDocument();
    expect(screen.getByAltText('MediaDays Solutions 2026')).toBeInTheDocument();
  });

  it('FR — CTA "M\'inscrire comme partenaire" → /inscription-partenaire?category=partenaire', () => {
    renderI18n(<HeroBandeau />);
    const link = screen.getByRole('link', { name: /inscrire comme partenaire/i });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/inscription-partenaire?category=partenaire');
  });

  it('EN — CTA "Register as a partner" présent', () => {
    renderI18n(<HeroBandeau />, { locale: 'en' });
    expect(screen.getByRole('link', { name: /register as a partner/i })).toBeInTheDocument();
  });

  it('section data-testid="hero-bandeau" présente', () => {
    renderI18n(<HeroBandeau />);
    expect(screen.getByTestId('hero-bandeau')).toBeInTheDocument();
  });
});
