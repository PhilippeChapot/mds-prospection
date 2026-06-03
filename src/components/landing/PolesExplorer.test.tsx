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

  it('P6.x.4-a-bis — pôle REGIES_RETAIL_MEDIA : 2 CTA externes vers mediadays.net (Exposer + Visiteur, target=_blank)', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const regies = poles.find((p) => p.code === 'REGIES_RETAIL_MEDIA')!;
    fireEvent.click(screen.getAllByText(regies.name)[0].closest('button')!);
    const exposerLink = screen.getByText(/Exposer sur mediadays.net/i).closest('a');
    const visitorLink = screen.getByText(/S.inscrire comme visiteur/i).closest('a');
    expect(exposerLink?.getAttribute('href')).toBe('https://mediadays.net');
    expect(exposerLink?.getAttribute('target')).toBe('_blank');
    expect(visitorLink?.getAttribute('href')).toBe('https://mediadays.net');
    expect(visitorLink?.getAttribute('target')).toBe('_blank');
    expect(visitorLink?.getAttribute('rel')).toContain('noopener');
  });

  it("CTA pôle 'mediadays_solutions' propose 'Réserver mon stand' interne", () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const data = poles.find((p) => p.code === 'DATA_ADTECH')!;
    fireEvent.click(screen.getAllByText(data.name)[0].closest('button')!);
    const cta = screen.getByText(/Réserver mon stand/i).closest('a');
    expect(cta?.getAttribute('href')).toContain('/inscription-partenaire');
  });

  it('P6.x.4-a-sexies — drawer ouvert affiche un bouton fermer accessible (aria-label="Fermer", FR)', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const audio = poles.find((p) => p.code === 'AUDIO_RADIO')!;
    fireEvent.click(screen.getAllByText(audio.name)[0].closest('button')!);
    const closeBtn = screen.getByRole('button', { name: 'Fermer' });
    expect(closeBtn).toBeTruthy();
    // touch target ≥ 44x44 (h-11 w-11 = 44px Tailwind)
    expect(closeBtn.className).toMatch(/h-11/);
    expect(closeBtn.className).toMatch(/w-11/);
  });

  it('P6.x.4-a-sexies — bouton fermer aria-label="Close" en locale EN', () => {
    renderI18n(<PolesExplorer poles={poles} />, { locale: 'en' });
    // Nom EN du pôle AUDIO_RADIO (messages/en.json)
    const enName = 'AUDIO & RADIO';
    const card = screen.getAllByText(enName)[0]?.closest('button');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('P6.x.4-a-sexies — click sur le bouton fermer ferme le drawer', () => {
    renderI18n(<PolesExplorer poles={poles} />);
    const audio = poles.find((p) => p.code === 'AUDIO_RADIO')!;
    fireEvent.click(screen.getAllByText(audio.name)[0].closest('button')!);
    // Le contenu unique du drawer "Paris Radio Show" est visible
    expect(screen.getAllByText('Paris Radio Show').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    // Après fermeture : seule la card reste (1 occurrence), le drawer a été démonté
    expect(screen.getAllByText('Paris Radio Show').length).toBe(1);
  });
});
