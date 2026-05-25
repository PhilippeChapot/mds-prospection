/**
 * @vitest-environment jsdom
 *
 * P6.x.3 — tests PlanCanvaInteractive (iframe Canva + overlay HTML).
 */

import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PlanCanvaInteractive } from './PlanCanvaInteractive';
import type { StandWithProspect } from '@/lib/admin/stands/queries';

// P6.x.3-ter — wrapper render avec NextIntlClientProvider pour fournir les
// clés ExposantDashboard.* utilisées par le tooltip (i18n FR/EN).
const messages = {
  ExposantDashboard: {
    exploreVenueTitle: '🏢 Explorer tout le salon',
    exploreVenueHelp: 'Découvrez qui expose à vos côtés.',
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

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="fr" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function makeStand(partial: Partial<StandWithProspect> & { number: string }): StandWithProspect {
  return {
    id: partial.id ?? `id-${partial.number}`,
    number: partial.number,
    salle: 'le_notre',
    taille_m2: partial.taille_m2 ?? 9,
    pole_recommended: null,
    status: partial.status ?? 'libre',
    prospect_id: partial.prospect_id ?? null,
    notes: null,
    position_x: 'position_x' in partial ? (partial.position_x ?? null) : 10,
    position_y: 'position_y' in partial ? (partial.position_y ?? null) : 20,
    position_w: 'position_w' in partial ? (partial.position_w ?? null) : 6,
    position_h: 'position_h' in partial ? (partial.position_h ?? null) : 8,
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    prospect: partial.prospect ?? null,
  };
}

describe('PlanCanvaInteractive (P6.x.3)', () => {
  it('rend l’iframe Canva + un rectangle par stand avec position non-null', () => {
    const stands = [
      makeStand({ number: 'A1' }),
      makeStand({ number: 'B5', status: 'reserve' }),
      // celui-ci a position_x null → doit être ignoré
      makeStand({ number: 'C9', position_x: null }),
    ];
    const { container } = render(<PlanCanvaInteractive mode="admin" stands={stands} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toMatch(/canva\.com\/design\/DAHGZNYdF2Q/);
    // 2 boutons rectangles overlay (A1 et B5 ; C9 sans position est skip)
    const overlayBtns = container.querySelectorAll('[data-stand-number]');
    expect(overlayBtns).toHaveLength(2);
    expect(overlayBtns[0].getAttribute('data-stand-number')).toBe('A1');
    expect(overlayBtns[1].getAttribute('data-stand-number')).toBe('B5');
  });

  it('couleur overlay alignée sur le status (vert/orange/rouge/gris)', () => {
    const stands = [
      makeStand({ number: 'A1', status: 'libre' }),
      makeStand({ number: 'A2', status: 'reserve' }),
      makeStand({ number: 'A3', status: 'paye' }),
      makeStand({ number: 'A4', status: 'bloque' }),
    ];
    const { container } = render(<PlanCanvaInteractive mode="admin" stands={stands} />);
    const btns = container.querySelectorAll<HTMLButtonElement>('[data-stand-number]');
    expect(btns[0].className).toMatch(/bg-emerald-400/);
    expect(btns[1].className).toMatch(/bg-orange-400/);
    expect(btns[2].className).toMatch(/bg-red-400/);
    expect(btns[3].className).toMatch(/bg-slate-400/);
    // 'bloque' a disabled = pas de click possible
    expect(btns[3].disabled).toBe(true);
  });

  it('highlightedStandId ajoute la classe ring-4 ring-pink-500 + data-highlighted', () => {
    const stands = [makeStand({ number: 'A1' }), makeStand({ number: 'B2' })];
    const { container } = render(
      <PlanCanvaInteractive mode="exposant" stands={stands} highlightedStandId="id-B2" />,
    );
    const btn = container.querySelector<HTMLButtonElement>('[data-stand-number="B2"]')!;
    expect(btn.getAttribute('data-highlighted')).toBe('true');
    expect(btn.className).toMatch(/ring-4/);
    expect(btn.className).toMatch(/ring-pink-500/);
    // L'autre n'a pas la classe ring
    const other = container.querySelector<HTMLButtonElement>('[data-stand-number="A1"]')!;
    expect(other.getAttribute('data-highlighted')).toBeNull();
    expect(other.className).not.toMatch(/ring-pink-500/);
  });

  it('click sur un rectangle → onStandClick appelé avec le bon stand', () => {
    const onClick = vi.fn();
    const stands = [makeStand({ number: 'A1' })];
    const { container } = render(
      <PlanCanvaInteractive mode="admin" stands={stands} onStandClick={onClick} />,
    );
    fireEvent.click(container.querySelector('[data-stand-number="A1"]')!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].number).toBe('A1');
  });

  it('hover → tooltip rendu avec numéro + status', () => {
    const stands = [makeStand({ number: 'A1', status: 'reserve', taille_m2: 6 })];
    const { container } = render(<PlanCanvaInteractive mode="admin" stands={stands} />);
    fireEvent.mouseEnter(container.querySelector('[data-stand-number="A1"]')!);
    const tooltip = screen.getByTestId('stand-tooltip');
    expect(tooltip.textContent).toMatch(/Stand A1/);
    expect(tooltip.textContent).toMatch(/Réservé/);
    expect(tooltip.textContent).toMatch(/6 m²/);
  });

  it('RGPD voisins exposant : company_public_visibility=false → nom anonymisé', () => {
    const stands = [
      makeStand({
        number: 'A1',
        status: 'paye',
        prospect: {
          id: 'p1',
          status: 'paye',
          company_name: 'Radio France',
          company_public_visibility: false,
          contact_email: null,
        },
      }),
    ];
    const { container } = render(<PlanCanvaInteractive mode="exposant" stands={stands} />);
    fireEvent.mouseEnter(container.querySelector('[data-stand-number="A1"]')!);
    const tooltip = screen.getByTestId('stand-tooltip');
    // Le nom NE doit PAS apparaitre quand public_visibility=false côté exposant
    expect(tooltip.textContent).not.toMatch(/Radio France/);
    // Mais bien apparaitre côté admin (override)
    const { container: adminContainer } = render(
      <PlanCanvaInteractive mode="admin" stands={stands} />,
    );
    fireEvent.mouseEnter(adminContainer.querySelector('[data-stand-number="A1"]')!);
    // Le deuxieme tooltip rendu (admin) contient le nom
    const tooltips = screen.getAllByTestId('stand-tooltip');
    const adminTooltip = tooltips[tooltips.length - 1];
    expect(adminTooltip.textContent).toMatch(/Radio France/);
  });
});
