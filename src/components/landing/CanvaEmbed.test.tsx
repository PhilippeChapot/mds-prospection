/**
 * @vitest-environment jsdom
 *
 * Lot 5 — Regression guard : l'embed iframe Canva a été supprimé.
 * DeckAndContactSection remplace CanvaEmbed depuis le Lot 5 Havas.
 *
 * Tests DeckAndContactSection :
 *   1. iframe Canva ABSENT du DOM (régression)
 *   2. Section title "En savoir plus sur MediaDays Solutions" (FR)
 *   3. Bouton Deck FR → href canva.link/29m0ohjwcpmo15b
 *   4. Bouton Deck EN → href canva.link/c5uqrizp8gyd4v2
 *   5. Carte contact : Philippe Chapot + mailto
 *   6. Section : grid md:grid-cols-2 (responsive)
 *   7. EN : section title + deckButton traduits
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

  it('FR — titre section "En savoir plus sur MediaDays Solutions"', () => {
    renderI18n(<DeckAndContactSection />);
    expect(screen.getByText('En savoir plus sur MediaDays Solutions')).toBeInTheDocument();
  });

  it('FR — lien Deck pointe vers canva.link/29m0ohjwcpmo15b', () => {
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
    expect(emailLink.textContent).toContain('philippe@mediadays.solutions');
  });

  it('section data-testid="deck-contact-section" + grille md:grid-cols-2', () => {
    const { container } = renderI18n(<DeckAndContactSection />);
    expect(screen.getByTestId('deck-contact-section')).toBeInTheDocument();
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-2');
  });

  it('EN — titre "Learn more about MediaDays Solutions" + bouton "Download the Deck"', () => {
    renderI18n(<DeckAndContactSection />, { locale: 'en' });
    expect(screen.getByText('Learn more about MediaDays Solutions')).toBeInTheDocument();
    // deckTitle et deckButton partagent le même libellé EN → plusieurs occurrences
    expect(screen.getAllByText('Download the Deck').length).toBeGreaterThanOrEqual(1);
  });
});
