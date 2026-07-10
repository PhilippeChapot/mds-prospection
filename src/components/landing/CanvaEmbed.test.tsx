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
 *   6. Carte contact : Philippe Chapot + placeholder avatar PC
 *   7. Boutons CTA : classe bg-md-magenta (rose vif)
 *   8. Section i18n : titre FR + EN traduits
 *
 * Landing-ContactPhil-LinkedIn — mailto remplacé par un lien LinkedIn :
 *   9. Bouton LinkedIn FR/EN : href + target=_blank + rel=noopener noreferrer
 *  10. Régression : plus aucun mailto: dans le DOM
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

  it('carte contact : Philippe Chapot + lien LinkedIn sur un <a> natif (pas <button>)', () => {
    renderI18n(<DeckAndContactSection />);
    expect(screen.getByText('Philippe Chapot')).toBeInTheDocument();
    const linkedInLink = screen.getByTestId('contact-linkedin-link');
    expect(linkedInLink.tagName).toBe('A');
    expect(linkedInLink.getAttribute('href')).toBe('https://www.linkedin.com/in/philippechapot/');
  });

  it('bouton LinkedIn : target=_blank + rel=noopener noreferrer (security)', () => {
    renderI18n(<DeckAndContactSection />);
    const linkedInLink = screen.getByTestId('contact-linkedin-link');
    expect(linkedInLink.getAttribute('target')).toBe('_blank');
    expect(linkedInLink.getAttribute('rel')).toContain('noopener');
    expect(linkedInLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('régression : plus aucun mailto: dans DeckAndContactSection', () => {
    const { container } = renderI18n(<DeckAndContactSection />);
    expect(container.innerHTML).not.toContain('mailto:');
  });

  it('FR — bouton "Me contacter sur LinkedIn"', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'fr' });
    expect(screen.getByText('Me contacter sur LinkedIn')).toBeInTheDocument();
  });

  it('EN — bouton "Reach out on LinkedIn"', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'en' });
    expect(screen.getByText('Reach out on LinkedIn')).toBeInTheDocument();
  });

  it('photo Philippe Chapot : <img> src="/brand/philippe-chapot-nb.jpg" dans avatar', () => {
    renderI18n(<DeckAndContactSection />);
    const avatar = screen.getByTestId('contact-avatar');
    expect(avatar).toBeInTheDocument();
    const img = avatar.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('philippe-chapot-nb');
  });

  it('boutons CTA ont la classe bg-md-magenta (rose vif)', () => {
    renderI18n(<DeckAndContactSection />);
    const deckBtn = screen.getByTestId('deck-download-link');
    const linkedInBtn = screen.getByTestId('contact-linkedin-link');
    expect(deckBtn.className).toContain('bg-md-magenta');
    expect(linkedInBtn.className).toContain('bg-md-magenta');
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
