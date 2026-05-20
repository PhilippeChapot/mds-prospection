/**
 * @vitest-environment jsdom
 *
 * P6.x-mobile-burger — tests burger menu admin (mobile).
 *
 * Cas couverts :
 *   - burger visible (avec `md:hidden`) + aria-label "Ouvrir le menu"
 *   - click sur burger ouvre le Sheet avec les items sidebar
 *   - click sur un item dans le drawer ferme le Sheet (onNavigate -> setOpen(false))
 *   - sidebar inline desktop reste rendue (cf. layout.tsx) -- pas concerne ici
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminMobileMenu } from './AdminMobileMenu';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

describe('AdminMobileMenu (P6.x-mobile-burger)', () => {
  it("rend un bouton burger 'Ouvrir le menu' (md:hidden = seulement < 768px)", () => {
    render(<AdminMobileMenu />);
    const burger = screen.getByRole('button', { name: 'Ouvrir le menu' });
    expect(burger).toBeInTheDocument();
    // Le burger doit etre invisible >= md (utilitaire Tailwind md:hidden)
    expect(burger.className).toMatch(/md:hidden/);
  });

  it('click burger ouvre le Sheet avec les sections de navigation admin', () => {
    render(<AdminMobileMenu />);
    // Avant clic : pas de Sheet contenu rendu (les sections ne sont pas visibles)
    expect(screen.queryByText('Prospects')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    // Apres clic : items sidebar visibles (sections Pipeline / Salon / Croissance / Reglages / Dev)
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Prospects')).toBeInTheDocument();
    expect(screen.getByText('Salon')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('click sur un item du drawer ferme le Sheet (onNavigate -> setOpen false)', () => {
    render(<AdminMobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    // Le Sheet est ouvert (items visibles)
    expect(screen.getByText('Prospects')).toBeInTheDocument();
    // Click sur "Prospects" -> doit fermer le drawer.
    fireEvent.click(screen.getByText('Prospects'));
    // Apres click : le contenu de la sidebar n'est plus dans le DOM.
    expect(screen.queryByText('Pipeline')).toBeNull();
    expect(screen.queryByText('Prospects')).toBeNull();
  });
});
