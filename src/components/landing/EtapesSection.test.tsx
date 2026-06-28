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

// P6.x.4-a-decies — mock BruxellesCtaButton pour eviter de monter le
// provider <InstitutionnelEcoleFormProvider> dans chaque test.
vi.mock('./BruxellesCtaButton', () => ({
  BruxellesCtaButton: ({
    label,
    ariaLabel,
    className,
  }: {
    label: string;
    ariaLabel: string;
    className?: string;
  }) => (
    <button type="button" aria-label={ariaLabel} className={className}>
      {label}
    </button>
  ),
}));

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
  it("rend les 3 cartes dans l'ordre Paris → Marseille → Bruxelles (Paris en vedette)", () => {
    renderI18n(<EtapesSection />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['MEDIADAYS PARIS', 'MEDIADAYS MARSEILLE', 'MEDIADAYS BRUXELLES']);
    expect(ETAPES.map((e) => e.id)).toEqual(['paris', 'marseille', 'bruxelles']);
  });

  it('Marseille → CTA Link interne /inscription-partenaire?venue=marseille (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByRole('link', { name: /MEDIADAYS MARSEILLE.*Réserver/ });
    expect(link.getAttribute('href')).toBe('/inscription-partenaire?venue=marseille');
  });

  it('Paris → CTA Link interne /inscription-partenaire?venue=paris (FR)', () => {
    renderI18n(<EtapesSection />);
    const link = screen.getByRole('link', { name: /MEDIADAYS PARIS.*Réserver/ });
    expect(link.getAttribute('href')).toBe('/inscription-partenaire?venue=paris');
  });

  it('P6.x.4-a-decies — Bruxelles CTA = bouton (plus de mailto), label "Demander des infos" en FR', () => {
    // BruxellesCtaButton est mocke (cf. mock plus bas) -> rend juste un bouton type=button.
    renderI18n(<EtapesSection />);
    const btn = screen.getByRole('button', { name: /MEDIADAYS BRUXELLES.*Demander des infos/ });
    expect(btn).toBeInTheDocument();
    // Plus aucun anchor mailto dans la section.
    const mailtoLinks = screen
      .queryAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').startsWith('mailto:'));
    expect(mailtoLinks).toHaveLength(0);
  });

  it('EN — titres section, dates et CTA traduits', () => {
    renderI18n(<EtapesSection />, { locale: 'en' });
    expect(screen.getByText('The 2026 edition stages')).toBeInTheDocument();
    expect(screen.getByText('December 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('December 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('November 26, 2026')).toBeInTheDocument();
    expect(screen.getAllByText(/Book my booth/).length).toBe(2);
    // P6.x.4-a-decies : Bruxelles CTA = "Request info" (plus de "Contact us")
    expect(screen.getByText(/Request info/)).toBeInTheDocument();
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
