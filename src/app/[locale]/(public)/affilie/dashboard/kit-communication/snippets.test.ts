/**
 * @vitest-environment node
 *
 * P7.x.1.E — tests pures snippets kit communication (refonte B2B).
 *
 * Doctrine : copy + signature pointent vers le wizard EXPOSANT (B2B),
 * pas la landing visiteur. Le pitch parle de "clients pro" et signe avec
 * le nom de l'affilie.
 */

import { describe, it, expect } from 'vitest';
import { buildEmailSignatureHtml, buildEmailCopy } from './snippets';

describe('buildEmailSignatureHtml (P7.x.1.E B2B)', () => {
  it('rend une table HTML avec nom + tagline MDS 2026 + 3 dates', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Lucas Aubrée',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS',
    });
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/Lucas Aubrée/);
    expect(html).toMatch(/Partenaire MediaDays Solutions 2026/);
    // Tagline NOUVEAU
    expect(html).toMatch(/Le NOUVEAU rendez-vous des médias/);
    // 3 dates inline
    expect(html).toMatch(/26 nov Bruxelles/);
    expect(html).toMatch(/10 déc Marseille/);
    expect(html).toMatch(/15 déc Paris/);
  });

  it('CTA principal pointe vers le wizard EXPOSANT (B2B)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=T',
    });
    expect(html).toMatch(/href="https:\/\/mediadays\.solutions\/fr\/inscription-exposant\?ref=T"/);
    expect(html).toMatch(/→ Réservez votre stand/);
  });

  it('sous-CTA secondaire vers mediadays.net (visiteur gratuit)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(html).toMatch(/href="https:\/\/mediadays\.net"/);
    expect(html).toMatch(/Inscription visiteur gratuite/);
  });

  it('brand colors MDS (#294294 marine + #E6007E magenta)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(html).toContain('#294294');
    expect(html).toContain('#E6007E');
  });

  it('echappe HTML (anti-injection sur affilieName)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: '<script>alert(1)</script>',
      trackingUrlExposant: 'https://example.com',
    });
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
});

describe('buildEmailCopy (P7.x.1.E B2B)', () => {
  it('FR : tutoiement + pitch B2B (régies/agences UDECAM) + signature affilie', () => {
    const text = buildEmailCopy('fr', {
      affilieName: 'Lucas Aubrée',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS',
    });
    expect(text).toMatch(/Bonjour \{prenom\}/);
    // Pitch B2B : on parle de l'ecosysteme pro, pas du visiteur gratuit
    expect(text).toMatch(/régies, annonceurs, agences UDECAM/);
    expect(text).toMatch(/solution tech \(audio, vidéo, adtech/);
    // 3 dates avec villes
    expect(text).toMatch(/10\/12 à Marseille/);
    expect(text).toMatch(/15\/12 à Paris/);
    expect(text).toMatch(/26\/11 à Bruxelles/);
    // CTA "Réserve ton stand" (tutoiement)
    expect(text).toMatch(/Réserve ton stand/);
    // Tracking exposant
    expect(text).toContain('https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS');
    // Signe avec le nom affilie en bas
    expect(text).toMatch(/À très vite,\nLucas Aubrée$/);
  });

  it('EN : "Book your booth" + pitch B2B + affilieName signature', () => {
    const text = buildEmailCopy('en', {
      affilieName: 'Jane Smith',
      trackingUrlExposant: 'https://mediadays.solutions/en/exhibitor-registration?ref=JANE',
    });
    expect(text).toMatch(/Hi \{first_name\}/);
    expect(text).toMatch(/ad networks, advertisers, UDECAM/);
    expect(text).toMatch(/tech solution \(audio, video, adtech/);
    // EN text wraps Nov/Dec mentions across newlines — use [\s\S]*? to span lines.
    expect(text).toMatch(/November 26[\s\S]*?Brussels/);
    expect(text).toMatch(/December 10[\s\S]*?Marseille/);
    expect(text).toMatch(/December 15[\s\S]*?Paris/);
    // CTA B2B "Book your booth"
    expect(text).toMatch(/Book your booth/);
    expect(text).toContain('https://mediadays.solutions/en/exhibitor-registration?ref=JANE');
    expect(text).toMatch(/See you there,\nJane Smith$/);
  });

  it("FR : ne dit PLUS 'entrée gratuite' (visiteur) ni 'Inscrivez-vous ici' (landing)", () => {
    const text = buildEmailCopy('fr', {
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(text).not.toMatch(/entrée est\s+gratuite/i);
    expect(text).not.toMatch(/Inscrivez-vous ici/);
  });
});
