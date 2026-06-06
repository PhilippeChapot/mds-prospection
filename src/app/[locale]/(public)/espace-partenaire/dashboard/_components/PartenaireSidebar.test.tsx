/**
 * @vitest-environment jsdom
 *
 * P5.x.17 — tests rendu sidebar Espace Partenaire V1.3.
 *
 * Cas couverts :
 *   - chaque item affiche son label traduit
 *   - active state correct selon pathname (aria-current="page")
 *   - clic appelle bien onNavigate (utile pour fermer le drawer mobile)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PartenaireSidebar } from './PartenaireSidebar';
import type { ContactProfile } from '@/lib/espace-partenaire/detect-profile';

const FULL_EXPO_PROFILE: ContactProfile = {
  contact_id: 'c1',
  email: 'x@y.fr',
  first_name: null,
  last_name: null,
  language: 'FR',
  company_id: 'co',
  company_name: 'Acme',
  is_partenaire: true,
  is_lead: false,
  is_affiliate: false,
  is_partner: false,
  has_stand: true,
  active_prospect_id: 'p1',
};

let mockedPathname = '/fr/espace-partenaire/dashboard/stand';
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => mockedPathname,
}));

const messages = {
  espacePartenaire: {
    nav: {
      sectionTitle: 'Espace Partenaire',
      stand: 'Mon stand',
      coordonnees: 'Mes coordonnees',
      documents: 'Mes documents',
      kitCommunication: 'Kit communication',
      invitations: 'Mes invitations',
      commander: 'Commander',
      commandes: 'Mes commandes',
      ressources: 'Ressources',
      messages: 'Messages',
      profil: 'Mon profil',
      preferencesEmail: 'Préférences email',
      logout: 'Se deconnecter',
      openMenu: 'Ouvrir le menu',
    },
  },
};

function renderSidebar(
  opts: { pathname?: string; onNavigate?: () => void; profile?: ContactProfile | null } = {},
) {
  mockedPathname = opts.pathname ?? '/fr/espace-partenaire/dashboard/stand';
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <PartenaireSidebar
        onNavigate={opts.onNavigate}
        profile={opts.profile === undefined ? FULL_EXPO_PROFILE : opts.profile}
      />
    </NextIntlClientProvider>,
  );
}

describe('PartenaireSidebar (P5.x.17)', () => {
  it('rend les 5 items traduits FR', () => {
    renderSidebar();
    expect(screen.getByText('Mon stand')).toBeInTheDocument();
    expect(screen.getByText('Mes coordonnees')).toBeInTheDocument();
    expect(screen.getByText('Mes documents')).toBeInTheDocument();
    expect(screen.getByText('Kit communication')).toBeInTheDocument();
    expect(screen.getByText('Mes invitations')).toBeInTheDocument();
  });

  it("marque l'item correspondant au pathname comme actif (aria-current=page)", () => {
    renderSidebar({ pathname: '/fr/espace-partenaire/dashboard/invitations' });
    const link = screen.getByText('Mes invitations').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
    // Les autres items NE doivent PAS etre marques actifs.
    const standLink = screen.getByText('Mon stand').closest('a');
    expect(standLink).not.toHaveAttribute('aria-current');
  });

  it('considere une sous-route comme active (prefix match)', () => {
    renderSidebar({ pathname: '/fr/espace-partenaire/dashboard/stand/sub' });
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
