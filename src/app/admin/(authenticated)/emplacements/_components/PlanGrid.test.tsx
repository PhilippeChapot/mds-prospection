/**
 * @vitest-environment jsdom
 *
 * P6.x.2a-ter — tests UI du grid 2D plan Canva.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { StandWithProspect } from '@/lib/admin/stands/queries';

// Mock next/navigation (useRouter) — pas accessible en pure jsdom unit test
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Import APRÈS le mock pour que useRouter soit pris en compte au load
const { EmplacementsClient, POLE_ZONE_BG, STATUS_COLOR } = await import('./EmplacementsClient');

function makeStand(
  partial: Partial<StandWithProspect> & {
    number: string;
    salle?: StandWithProspect['salle'];
    status?: StandWithProspect['status'];
    pole_recommended?: StandWithProspect['pole_recommended'];
  },
): StandWithProspect {
  return {
    id: partial.id ?? `id-${partial.number}`,
    number: partial.number,
    salle: partial.salle ?? 'le_notre',
    taille_m2: partial.taille_m2 ?? 9,
    pole_recommended: partial.pole_recommended ?? null,
    status: partial.status ?? 'libre',
    prospect_id: partial.prospect_id ?? null,
    notes: null,
    position_x: partial.position_x ?? null,
    position_y: partial.position_y ?? null,
    position_w: partial.position_w ?? null,
    position_h: partial.position_h ?? null,
    created_at: '2026-05-18T00:00:00Z',
    updated_at: '2026-05-18T00:00:00Z',
    prospect: partial.prospect ?? null,
  };
}

const SAMPLE: StandWithProspect[] = [
  makeStand({ number: 'A1', pole_recommended: 'AUDIO_RADIO', taille_m2: 6 }),
  makeStand({ number: 'B0', pole_recommended: 'DATA_ADTECH', taille_m2: 6 }),
  makeStand({ number: 'E5', pole_recommended: 'DIFFUSION_INFRA' }),
  makeStand({
    number: 'B5',
    pole_recommended: 'AUDIO_RADIO',
    status: 'reserve',
    prospect_id: 'p-1',
  }),
  makeStand({
    number: 'B6',
    pole_recommended: 'AUDIO_RADIO',
    status: 'paye',
    prospect_id: 'p-2',
  }),
  makeStand({ number: 'G0', pole_recommended: 'OUTDOOR_DOOH', taille_m2: 6 }),
  makeStand({ number: 'H9', pole_recommended: 'VIDEO_CTV' }),
];

const KPIS = { total: 8, libre: 4, reserve: 1, reserve_signe: 2, paye: 1, bloque: 0 };

describe('PlanGrid 2D (P6.x.2a-ter)', () => {
  it('background pôle correct selon zone (zone backgrounds par pôle)', () => {
    const { container } = render(
      <EmplacementsClient initialStands={SAMPLE} initialKpis={KPIS} initialProspects={[]} />,
    );
    const a1 = container.querySelector('[data-stand-number="A1"]') as HTMLElement | null;
    const b0 = container.querySelector('[data-stand-number="B0"]') as HTMLElement | null;
    const g0 = container.querySelector('[data-stand-number="G0"]') as HTMLElement | null;
    expect(a1).toBeTruthy();
    expect(a1!.className).toContain(POLE_ZONE_BG.AUDIO_RADIO);
    expect(b0!.className).toContain(POLE_ZONE_BG.DATA_ADTECH);
    expect(g0!.className).toContain(POLE_ZONE_BG.OUTDOOR_DOOH);
  });

  it('border colorée par status : libre=emerald, réservé=orange, payé=red', () => {
    const { container } = render(
      <EmplacementsClient initialStands={SAMPLE} initialKpis={KPIS} initialProspects={[]} />,
    );
    const a1 = container.querySelector('[data-stand-number="A1"]') as HTMLElement; // libre
    const b5 = container.querySelector('[data-stand-number="B5"]') as HTMLElement; // reserve
    const b6 = container.querySelector('[data-stand-number="B6"]') as HTMLElement; // paye
    expect(a1.className).toContain('border-emerald-500');
    expect(b5.className).toContain('border-orange-500');
    expect(b6.className).toContain('border-red-500');
  });

  it('cellules vides (A5, H0, etc.) sont rendues comme placeholders (pas de stand)', () => {
    const { container } = render(
      <EmplacementsClient initialStands={SAMPLE} initialKpis={KPIS} initialProspects={[]} />,
    );
    // A5 et H0 ne sont pas dans SAMPLE, donc pas de bouton avec data-stand-number=A5
    expect(container.querySelector('[data-stand-number="A5"]')).toBeNull();
    expect(container.querySelector('[data-stand-number="H0"]')).toBeNull();
    // Mais A1 si
    expect(container.querySelector('[data-stand-number="A1"]')).toBeTruthy();
  });

  it('STATUS_COLOR : libre=emerald, reserve=orange, paye=red, bloque=slate', () => {
    expect(STATUS_COLOR.libre.ring).toMatch(/emerald/);
    expect(STATUS_COLOR.reserve.ring).toMatch(/orange/);
    expect(STATUS_COLOR.paye.ring).toMatch(/red/);
    expect(STATUS_COLOR.bloque.ring).toMatch(/slate/);
  });

  it('headers de colonnes affichés de 10 à 0 (gauche → droite, comme dans le plan Canva)', () => {
    const { container } = render(
      <EmplacementsClient initialStands={SAMPLE} initialKpis={KPIS} initialProspects={[]} />,
    );
    const html = container.innerHTML;
    // Les headers col 10 et col 0 sont tous deux présents
    expect(html).toContain('>10<');
    expect(html).toContain('>0<');
    // Vérification ordre : "10" apparaît AVANT "0" dans le markup linéaire
    expect(html.indexOf('>10<')).toBeLessThan(html.indexOf('>0<'));
  });
});
