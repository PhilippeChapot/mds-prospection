/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a-octies / nonies — tests section "Les etapes de l'edition 2026".
 *
 * Nonies : seul le bouton CTA est un anchor (la carte n'est plus
 * cliquable globalement — fix click Bruxelles mailto sur mobile Safari).
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EtapesSection, ETAPES } from './EtapesSection';
import { renderI18n } from './__test-helpers__/i18n-render';

// next-intl Link routing : mock minimal pour eviter le runtime next/navigation.
vi.mock('@/i18n/navigation', () => {
  return {
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: { pathname: string; query?: Record<string, string> } | string;
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
  };
});

describe('EtapesSection (P6.x.4-a-octies/nonies)', () => {
  it('rend les 3 cartes dans l’ordre Marseille → Paris → Bruxelles', () => {
    renderI18n(<EtapesSection />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['MEDIADAYS MARSEILLE', 'MEDIADAYS PARIS', 'MEDIADAYS BRUXELLES']);
    expect(ETAPES.map((e) => e.id)).toEqual(['marseille', 'paris', 'bruxelles']);
  });

  it('Marseille → CTA Link interne /inscription-exposant?venue=marseille (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByRole('link', { name: /MEDIADAYS MARSEILLE.*Réserver/ });
    expect(link.getAttribute('href')).toBe('/inscription-exposant?venue=marseille');
  });

  it('Paris → CTA Link interne /inscription-exposant?venue=paris (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByRole('link', { name: /MEDIADAYS PARIS.*Réserver/ });
    expect(link.getAttribute('href')).toBe('/inscription-exposant?venue=paris');
  });

  it('Bruxelles → CTA <a> mailto cliquable (P6.x.4-a-nonies : pas d’anchor imbrique)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByRole('link', { name: /MEDIADAYS BRUXELLES.*Nous contacter/ });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('mailto:contact@mediadays.solutions')).toBe(true);
    expect(href).toContain('Bruxelles');
    // L'<a> n'est jamais nested dans un autre <a>.
    expect(link.closest('a:not([href="' + href + '"])')).toBeNull();
  });

  it('EN — titres section, dates et CTA traduits', () => {
    renderI18n(<EtapesSection />, { locale: 'en' });
    expect(screen.getByText('The 2026 edition stages')).toBeInTheDocument();
    expect(screen.getByText('December 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('December 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('November 26, 2026')).toBeInTheDocument();
    expect(screen.getAllByText(/Book my booth/).length).toBe(2);
    expect(screen.getByText(/Contact us/)).toBeInTheDocument();
  });

  it('venues affiches : Palais du Pharo, Carrousel du Louvre, Mix Brussels', () => {
    renderI18n(<EtapesSection />);
    expect(screen.getByText('Palais du Pharo')).toBeInTheDocument();
    expect(screen.getByText('Carrousel du Louvre')).toBeInTheDocument();
    expect(screen.getByText('Mix Brussels')).toBeInTheDocument();
  });

  it('P6.x.4-a-nonies — utilise les vraies images PNG (brand kit)', () => {
    renderI18n(<EtapesSection />);
    const images = screen.getAllByRole('img');
    const srcs = images.map((img) => img.getAttribute('src'));
    expect(srcs).toContain('/landing/etape-marseille.png');
    expect(srcs).toContain('/landing/etape-paris.png');
    expect(srcs).toContain('/landing/etape-bruxelles.png');
    // Plus aucun fichier .svg
    for (const src of srcs) {
      expect(src).not.toMatch(/\.svg$/);
    }
  });
});
