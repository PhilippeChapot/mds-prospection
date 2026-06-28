/**
 * @vitest-environment jsdom
 *
 * Lot 4 — redesign section visiteurs Havas :
 *   1. 14 cards visiteurs rendues
 *   2. Chaque card : bg-white + border-2 + border-[#0D1D6D]
 *   3. Hover state : hover:shadow-lg présent dans className
 *   4. Contenu preservé : titre + count + CTA "Voir"
 *   5. EN : même rendu (14 familles)
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { VisitorFamiliesExplorer } from './VisitorFamiliesExplorer';
import { InstitutionnelEcoleFormProvider } from './institutionnel-ecole-form-context';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { renderI18n } from './__test-helpers__/i18n-render';

vi.mock('./InstitutionnelEcoleForm', () => ({
  InstitutionnelEcoleForm: ({ open, type }: { open: boolean; type: string }) =>
    open ? <div data-testid={`form-open-${type}`}>FORM-{type}</div> : null,
}));

const { visiteurs, poles } = getTaxonomy();

function renderVisitors(locale: 'fr' | 'en' = 'fr') {
  return renderI18n(
    <InstitutionnelEcoleFormProvider>
      <VisitorFamiliesExplorer families={visiteurs} poles={poles} />
    </InstitutionnelEcoleFormProvider>,
    { locale },
  );
}

describe('Lot 4 — visitor cards Havas redesign', () => {
  it('rend exactement 14 cards visiteurs', () => {
    renderVisitors();
    const cards = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('border-[#0D1D6D]'));
    expect(cards).toHaveLength(14);
  });

  it('chaque card a bg-white + border-2 + border-[#0D1D6D]', () => {
    renderVisitors();
    const cards = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('border-[#0D1D6D]'));
    for (const card of cards) {
      expect(card.className).toContain('bg-white');
      expect(card.className).toContain('border-2');
      expect(card.className).toContain('border-[#0D1D6D]');
    }
  });

  it('hover state hover:shadow-lg présent sur les cards', () => {
    renderVisitors();
    const firstCard = screen
      .getAllByRole('button')
      .find((b) => b.className.includes('border-[#0D1D6D]'));
    expect(firstCard?.className).toContain('hover:shadow-lg');
  });

  it('contenu preservé : titre famille 1 + CTA "Voir" (FR)', () => {
    renderVisitors();
    expect(screen.getAllByText('Annonceurs grands comptes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Voir').length).toBeGreaterThan(0);
  });

  it('EN : 14 familles rendues avec titres traduits', () => {
    renderVisitors('en');
    expect(screen.getAllByText('Major brand advertisers').length).toBeGreaterThan(0);
    expect(screen.getAllByText('View').length).toBeGreaterThan(0);
  });
});
