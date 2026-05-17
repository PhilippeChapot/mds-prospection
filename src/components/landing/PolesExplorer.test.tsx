/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a — tests render 6 pôles + sheet ouvert au clic.
 */

import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { PolesExplorer } from './PolesExplorer';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { renderI18n } from './__test-helpers__/i18n-render';

const poles = getTaxonomy().poles;

describe('PolesExplorer (P6.x.4-a)', () => {
  it('rend les 6 pôles', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    for (const p of poles) {
      // Le nom du pôle apparaît dans la card
      expect(screen.getAllByText(p.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('clique sur un pôle ouvre le drawer Sheet avec son contenu', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const audio = poles.find((p) => p.code === 'AUDIO_RADIO')!;
    const card = screen.getAllByText(audio.name)[0].closest('button');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    // Le sub_label "Paris Radio Show" n'existe que sur AUDIO_RADIO et apparaît
    // à la fois dans la card et dans le drawer ouvert
    const matches = screen.getAllByText('Paris Radio Show');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("CTA pôle 'mediadays_classique' propose mediadays.net + sous-CTA visiteur", () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const regies = poles.find((p) => p.code === 'REGIES_RETAIL_MEDIA')!;
    fireEvent.click(screen.getAllByText(regies.name)[0].closest('button')!);
    const exposerLink = screen.getByText(/Exposer sur mediadays.net/i).closest('a');
    expect(exposerLink?.getAttribute('href')).toBe('https://mediadays.net');
    expect(screen.getByText(/S.inscrire comme visiteur/i)).toBeTruthy();
  });

  it("CTA pôle 'mediadays_solutions' propose 'Réserver mon stand' interne", () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const data = poles.find((p) => p.code === 'DATA_ADTECH')!;
    fireEvent.click(screen.getAllByText(data.name)[0].closest('button')!);
    const cta = screen.getByText(/Réserver mon stand/i).closest('a');
    expect(cta?.getAttribute('href')).toContain('/inscription-exposant');
  });
});
