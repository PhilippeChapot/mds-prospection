/**
 * @vitest-environment jsdom
 *
 * Lot 5 — Regression guard : l'embed iframe Canva a été supprimé.
 * DeckAndContactSection remplace CanvaEmbed depuis le Lot 5 Havas.
 *
 * Lot 5 fix — Tests redesign bleu PRS + rose + wording "Consultez" :
 *   1. iframe Canva ABSENT du DOM (régression)
 *   2. Section bg : bg-[#0D1D6D]
 *   3. Bouton FR : label "Consultez le Deck" (pas "Téléchargez")
 *   4. Bouton EN : label "View the Deck" (pas "Download")
 *   5. Href FR/EN corrects
 *   6. Carte contact : Philippe Chapot + mailto + placeholder avatar PC
 *   7. Boutons CTA : classe bg-md-magenta (rose vif)
 *   8. Section i18n : titre FR + EN traduits
 */

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { DeckAndContactSection } from './DeckAndContactSection';
import { renderI18n } from './__test-helpers__/i18n-render';

describe('DeckAndContactSection (Lot 5 — remplace CanvaEmbed)', () => {
  it('iframe Canva ABSENT du DOM (regression guard)', () => {
    const { container } = renderI18n(<DeckAndContactSection />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('section bg-[#0D1D6D] (bleu PRS marine)', () => {
    renderI18n(<DeckAndContactSection />);
    const section = screen.getByTestId('deck-contact-section');
    expect(section.className).toContain('bg-[#0D1D6D]');
  });

  it('FR — bouton "Consultez le Deck" (plus "Telecharger")', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'fr' });
    expect(screen.getAllByText('Consultez le Deck').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Télécharger/)).toBeNull();
  });

  it('EN — bouton "View the Deck" (plus "Download")', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'en' });
    expect(screen.getAllByText('View the Deck').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Download/)).toBeNull();
  });

  it('FR — lien Deck pointe vers canva.link/29m0ohjwcpmo15b + target=_blank', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'fr' });
    const link = screen.getByTestId('deck-download-link');
    expect(link.getAttribute('href')).toBe('https://canva.link/29m0ohjwcpmo15b');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('EN — lien Deck pointe vers canva.link/c5uqrizp8gyd4v2', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'en' });
    const link = screen.getByTestId('deck-download-link');
    expect(link.getAttribute('href')).toBe('https://canva.link/c5uqrizp8gyd4v2');
  });

  it('carte contact : Philippe Chapot + lien mailto', () => {
    renderI18n(<DeckAndContactSection />);
    expect(screen.getByText('Philippe Chapot')).toBeInTheDocument();
    const emailLink = screen.getByTestId('contact-email-link');
    expect(emailLink.getAttribute('href')).toBe('mailto:philippe@mediadays.solutions');
  });

  it('placeholder avatar PC visible (photo non encore déposée)', () => {
    renderI18n(<DeckAndContactSection />);
    expect(screen.getByTestId('contact-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('contact-avatar').textContent).toContain('PC');
  });

  it('boutons CTA ont la classe bg-md-magenta (rose vif)', () => {
    renderI18n(<DeckAndContactSection />);
    const deckBtn = screen.getByTestId('deck-download-link');
    const mailBtn = screen.getByTestId('contact-email-link');
    expect(deckBtn.className).toContain('bg-md-magenta');
    expect(mailBtn.className).toContain('bg-md-magenta');
  });

  it('grille md:grid-cols-2 responsive', () => {
    const { container } = renderI18n(<DeckAndContactSection />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-2');
  });

  it('EN — titre "Learn more about MediaDays Solutions"', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'en' });
    expect(screen.getByText('Learn more about MediaDays Solutions')).toBeInTheDocument();
  });
});
