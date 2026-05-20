/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a-octies — tests section "Les etapes de l'edition 2026".
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EtapesSection, ETAPES } from './EtapesSection';
import { renderI18n } from './__test-helpers__/i18n-render';

// next-intl Link routing : mock minimal pour eviter de monter le runtime
// next/navigation complet dans jsdom.
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

describe('EtapesSection (P6.x.4-a-octies)', () => {
  it('rend les 3 cartes dans l’ordre Marseille → Paris → Bruxelles', () => {
    renderI18n(<EtapesSection />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['MEDIADAYS MARSEILLE', 'MEDIADAYS PARIS', 'MEDIADAYS BRUXELLES']);
    // Ordre statique aussi dans le tableau exporte (source of truth)
    expect(ETAPES.map((e) => e.id)).toEqual(['marseille', 'paris', 'bruxelles']);
  });

  it('Marseille → CTA interne /inscription-exposant?venue=marseille (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByLabelText(/MEDIADAYS MARSEILLE — 10 décembre 2026/);
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/inscription-exposant?venue=marseille');
  });

  it('Paris → CTA interne /inscription-exposant?venue=paris (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByLabelText(/MEDIADAYS PARIS — 15 décembre 2026/);
    expect(link.getAttribute('href')).toBe('/inscription-exposant?venue=paris');
  });

  it('Bruxelles → CTA externe mailto: contact@mediadays.solutions (aucun back office)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByLabelText(/MEDIADAYS BRUXELLES — 26 novembre 2026/);
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('mailto:contact@mediadays.solutions')).toBe(true);
    expect(href).toContain('Bruxelles');
    // CTA libelle = "Nous contacter" (pas "Reserver mon stand")
    expect(link.textContent).toMatch(/Nous contacter/);
    expect(link.textContent).not.toMatch(/Réserver/);
  });

  it('EN — titres section, dates et CTA traduits', () => {
    renderI18n(<EtapesSection />, { locale: 'en' });
    expect(screen.getByText('The 2026 edition stages')).toBeInTheDocument();
    expect(screen.getByText('December 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('December 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('November 26, 2026')).toBeInTheDocument();
    // CTAs : "Book my booth" sur Marseille/Paris, "Contact us" sur Bruxelles.
    expect(screen.getAllByText(/Book my booth/).length).toBe(2);
    expect(screen.getByText(/Contact us/)).toBeInTheDocument();
  });

  it('venues affiches : Palais du Pharo, Carrousel du Louvre, Mix Brussels', () => {
    renderI18n(<EtapesSection />);
    expect(screen.getByText('Palais du Pharo')).toBeInTheDocument();
    expect(screen.getByText('Carrousel du Louvre')).toBeInTheDocument();
    expect(screen.getByText('Mix Brussels')).toBeInTheDocument();
  });
});
