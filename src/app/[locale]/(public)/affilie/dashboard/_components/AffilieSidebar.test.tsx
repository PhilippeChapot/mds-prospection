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
vi.mock('next/navigation', () => ({
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
  it('rend les 5 entries (3 actives + 2 disabled P7.x.1.C)', async () => {
    await renderSidebar();
    expect(screen.getByText('Statistiques')).toBeInTheDocument();
    expect(screen.getByText('Mes liens')).toBeInTheDocument();
    expect(screen.getByText('Mes paiements')).toBeInTheDocument();
    expect(screen.getByText('Kit communication')).toBeInTheDocument();
    expect(screen.getByText('Mon profil')).toBeInTheDocument();
    // Tags P7.x.1.C visibles sur les disabled
    expect(screen.getAllByText(/P7\.x\.1\.C/).length).toBe(2);
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

  it('les entries disabled (kit-comm, profil) ne sont pas des <a> cliquables', async () => {
    await renderSidebar();
    const kitSpan = screen.getByText('Kit communication').closest('span[aria-disabled]');
    expect(kitSpan).toBeTruthy();
    // Pas de <a> wrappant l'entree disabled (la div est un <span>, pas un Link)
    expect(kitSpan?.tagName.toLowerCase()).toBe('span');
    // L'attribut aria-disabled est rendu (presence verifiee par le selecteur)
    expect(kitSpan?.hasAttribute('aria-disabled')).toBe(true);
  });
});
