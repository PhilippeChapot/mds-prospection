/**
 * @vitest-environment jsdom
 *
 * P5.x.17 — tests rendu sidebar Espace Exposant V1.3.
 *
 * Cas couverts :
 *   - chaque item affiche son label traduit
 *   - active state correct selon pathname (aria-current="page")
 *   - clic appelle bien onNavigate (utile pour fermer le drawer mobile)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ExposantSidebar } from './ExposantSidebar';

let mockedPathname = '/fr/espace-exposant/dashboard/stand';
vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname,
}));

const messages = {
  espaceExposant: {
    nav: {
      sectionTitle: 'Espace Exposant',
      stand: 'Mon stand',
      coordonnees: 'Mes coordonnees',
      documents: 'Mes documents',
      kitCommunication: 'Kit communication',
      invitations: 'Mes invitations',
      logout: 'Se deconnecter',
      openMenu: 'Ouvrir le menu',
    },
  },
};

function renderSidebar(opts: { pathname?: string; onNavigate?: () => void } = {}) {
  mockedPathname = opts.pathname ?? '/fr/espace-exposant/dashboard/stand';
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <ExposantSidebar onNavigate={opts.onNavigate} />
    </NextIntlClientProvider>,
  );
}

describe('ExposantSidebar (P5.x.17)', () => {
  it('rend les 5 items traduits FR', () => {
    renderSidebar();
    expect(screen.getByText('Mon stand')).toBeInTheDocument();
    expect(screen.getByText('Mes coordonnees')).toBeInTheDocument();
    expect(screen.getByText('Mes documents')).toBeInTheDocument();
    expect(screen.getByText('Kit communication')).toBeInTheDocument();
    expect(screen.getByText('Mes invitations')).toBeInTheDocument();
  });

  it("marque l'item correspondant au pathname comme actif (aria-current=page)", () => {
    renderSidebar({ pathname: '/fr/espace-exposant/dashboard/invitations' });
    const link = screen.getByText('Mes invitations').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
    // Les autres items NE doivent PAS etre marques actifs.
    const standLink = screen.getByText('Mon stand').closest('a');
    expect(standLink).not.toHaveAttribute('aria-current');
  });

  it('considere une sous-route comme active (prefix match)', () => {
    renderSidebar({ pathname: '/fr/espace-exposant/dashboard/stand/sub' });
    const link = screen.getByText('Mon stand').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('appelle onNavigate au clic sur un item', () => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    fireEvent.click(screen.getByText('Mes documents'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
