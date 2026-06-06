/**
 * @vitest-environment jsdom
 *
 * P7.x.1.B — tests sidebar Espace Affilie.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';

let mockedPathname = '/fr/affilie/dashboard/stats';
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => mockedPathname,
}));

async function renderSidebar(pathname?: string) {
  mockedPathname = pathname ?? '/fr/affilie/dashboard/stats';
  const { AffilieSidebar } = await import('./AffilieSidebar');
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <AffilieSidebar />
    </NextIntlClientProvider>,
  );
}

describe('AffilieSidebar (P7.x.1.B)', () => {
  it('P7.x.1.F — rend les 6 entries actives (stats/societes/tracking/paiements/kit/profil)', async () => {
    await renderSidebar();
    expect(screen.getByText('Statistiques')).toBeInTheDocument();
    expect(screen.getByText('Mes sociétés')).toBeInTheDocument();
    expect(screen.getByText('Mes liens')).toBeInTheDocument();
    expect(screen.getByText('Mes paiements')).toBeInTheDocument();
    expect(screen.getByText('Kit communication')).toBeInTheDocument();
    expect(screen.getByText('Mon profil')).toBeInTheDocument();
    // Aucune entree disabled
    expect(screen.queryAllByText(/P7\.x\.1\.C/).length).toBe(0);
    // Toutes cliquables (Link)
    expect(screen.getByText('Mes sociétés').closest('a')).toBeTruthy();
    expect(screen.getByText('Mon profil').closest('a')).toBeTruthy();
  });

  it("aria-current=page sur l'entree matchee par pathname", async () => {
    await renderSidebar('/fr/affilie/dashboard/paiements');
    const paiementsLink = screen.getByText('Mes paiements').closest('a');
    expect(paiementsLink).toHaveAttribute('aria-current', 'page');
    const statsLink = screen.getByText('Statistiques').closest('a');
    expect(statsLink).not.toHaveAttribute('aria-current');
  });

  it('sous-route detecte aussi comme active (prefix match)', async () => {
    await renderSidebar('/fr/affilie/dashboard/tracking/something');
    const trackingLink = screen.getByText('Mes liens').closest('a');
    expect(trackingLink).toHaveAttribute('aria-current', 'page');
  });
});
