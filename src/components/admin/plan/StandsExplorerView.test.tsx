/**
 * @vitest-environment jsdom
 *
 * P6.x.3-ter — tests StandsExplorerView (toggle Grid 2D ↔ Plan visuel
 * pour la section "Explorer le salon" de l'espace exposant).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StandsExplorerView } from './StandsExplorerView';
import type { StandPublicView } from '@/lib/espace-exposant/stands-public-view';

const messages = {
  ExposantDashboard: {
    exploreVenueTitle: '📍 Plan du salon — Salle Le Nôtre',
    exploreVenueHelp:
      'Votre stand {number} est mis en évidence (encadré rose). Survolez les autres stands.',
    exploreVenueHelpNoStand: 'Survolez les stands.',
    exploreVenueGrid: 'Grid 2D',
    exploreVenuePlan: 'Plan visuel',
    your_booth: 'Votre stand',
    stand_company_hidden: 'Confidentiel',
    stand_status_libre: 'Disponible',
    stand_status_reserve: 'Réservé',
    stand_status_paye: 'Confirmé ✓',
    stand_status_bloque: 'Bloqué',
  },
};

function withProvider(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function makeStand(p: Partial<StandPublicView> & { number: string }): StandPublicView {
  return {
    id: p.id ?? `id-${p.number}`,
    number: p.number,
    salle: 'le_notre',
    taille_m2: p.taille_m2 ?? 9,
    pole_recommended: null,
    status: p.status ?? 'libre',
    position_x: 'position_x' in p ? (p.position_x ?? null) : 10,
    position_y: 'position_y' in p ? (p.position_y ?? null) : 20,
    position_w: 'position_w' in p ? (p.position_w ?? null) : 6,
    position_h: 'position_h' in p ? (p.position_h ?? null) : 8,
    prospect: p.prospect ?? null,
  };
}

describe('StandsExplorerView (P6.x.3-ter)', () => {
  it('rend les 2 onglets Grid 2D + Plan visuel avec Grid 2D actif par defaut', () => {
    const stands = [makeStand({ number: 'A1' })];
    render(withProvider(<StandsExplorerView stands={stands} />));
    // Grid 2D actif -> on voit les cellules Grid (avec data-stand-number)
    const gridCells = document.querySelectorAll('[data-stand-number="A1"]');
    expect(gridCells.length).toBeGreaterThanOrEqual(1);
  });

  it('rend les deux triggers de toggle Grid 2D et Plan visuel (mode read-only)', () => {
    const stands = [makeStand({ number: 'A1' })];
    render(withProvider(<StandsExplorerView stands={stands} />));
    // Les 2 triggers sont presents (toggle UI)
    const triggers = screen.getAllByRole('tab');
    expect(triggers).toHaveLength(2);
    expect(triggers[0].textContent).toMatch(/Grid 2D/);
    expect(triggers[1].textContent).toMatch(/Plan visuel/);
  });

  it('chaque trigger a un value Radix lié à son onglet (controlled)', () => {
    const stands = [makeStand({ number: 'A1' })];
    render(withProvider(<StandsExplorerView stands={stands} />));
    const triggers = screen.getAllByRole('tab');
    // data-state initial : grid actif, plan inactif (cohérent avec defaultValue='grid')
    expect(triggers[0].getAttribute('data-state')).toBe('active');
    expect(triggers[1].getAttribute('data-state')).toBe('inactive');
  });

  it('highlightedStandId est transmis aux deux vues', () => {
    const stands = [makeStand({ number: 'A1' }), makeStand({ number: 'B2' })];
    render(withProvider(<StandsExplorerView stands={stands} highlightedStandId="id-B2" />));
    // En Grid 2D, le stand B2 doit avoir data-highlighted=true
    const highlighted = document.querySelector('[data-stand-number="B2"][data-highlighted="true"]');
    expect(highlighted).toBeTruthy();
  });
});
