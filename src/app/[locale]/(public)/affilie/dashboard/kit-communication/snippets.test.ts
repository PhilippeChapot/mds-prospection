/**
 * @vitest-environment node
 *
 * P7.x.1.E-bis — tests pures snippets kit comm (B2B + 5 pôles tech).
 *
 * Doctrine :
 *   - Affiliation = exposants UNIQUEMENT (visiteurs = entree gratuite,
 *     pas de commission). CTA pointe vers le wizard exposant.
 *   - Perimetre = 5 poles MDS tech : audio, diffusion, video & CTV,
 *     outdoor & DOOH, data & adtech. PAS de regies, PAS de retail
 *     media (porte par Havas sur mediadays.net classique).
 *   - Wording : "aux MediaDays" (pluriel correct).
 */

import { describe, it, expect } from 'vitest';
import { buildEmailSignatureHtml, buildEmailCopy } from './snippets';

describe('buildEmailSignatureHtml (P7.x.1.E-bis)', () => {
  it('rend une table HTML avec nom + tagline "Les MediaDays" + 5 poles', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Lucas Aubrée',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS',
    });
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/Lucas Aubrée/);
    expect(html).toMatch(/Partenaire MediaDays Solutions 2026/);
    // E-bis : "Les MediaDays" (pluriel correct)
    expect(html).toMatch(/Les MediaDays Solutions 2026/);
    // 5 poles tech listes
    expect(html).toMatch(/Audio/);
    expect(html).toMatch(/Diffusion/);
    expect(html).toMatch(/Vidéo/);
    expect(html).toMatch(/Outdoor/);
    expect(html).toMatch(/Data/);
    // 3 dates inline
    expect(html).toMatch(/26 nov Bruxelles/);
    expect(html).toMatch(/10 déc Marseille/);
    expect(html).toMatch(/15 déc Paris/);
  });

  it('ne mentionne PAS regies ni retailers (perimetre Havas, hors MDS)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(html).not.toMatch(/régies/i);
    expect(html).not.toMatch(/retailers/i);
    expect(html).not.toMatch(/retail media/i);
  });

  it('CTA principal pointe vers le wizard EXPOSANT (B2B)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=T',
    });
    expect(html).toMatch(/href="https:\/\/mediadays\.solutions\/fr\/inscription-exposant\?ref=T"/);
    expect(html).toMatch(/→ Réservez votre stand/);
  });

  it('sous-CTA secondaire vers mediadays.net : wording elargi (P7.x.1.E-quater)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(html).toMatch(/href="https:\/\/mediadays\.net"/);
    // E-quater : "Vous venez visiter ?" (neutre, ne discrimine pas les
    // 14 familles visiteurs). Plus de "Annonceur ou agence" restrictif.
    expect(html).toMatch(/Vous venez visiter \?/);
    expect(html).toMatch(/Inscription gratuite/);
    expect(html).not.toMatch(/Annonceur ou agence/);
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

describe('buildEmailCopy (P7.x.1.E-bis)', () => {
  it('FR : tutoiement + 5 poles tech + signature affilie + tracking exposant', () => {
    const text = buildEmailCopy('fr', {
      affilieName: 'Lucas Aubrée',
      trackingUrlExposant: 'https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS',
    });
    expect(text).toMatch(/Bonjour \{prenom\}/);
    // Mention des 5 poles tech
    expect(text).toMatch(/5 pôles tech/);
    expect(text).toMatch(/audio, diffusion, vidéo & CTV/);
    expect(text).toMatch(/outdoor & DOOH/);
    expect(text).toMatch(/data & adtech/);
    // Audience visee : annonceurs/agences/editeurs/producteurs (PAS regies)
    expect(text).toMatch(/Annonceurs, agences, éditeurs et producteurs/);
    // 3 dates avec villes
    expect(text).toMatch(/26\/11 à Bruxelles/);
    expect(text).toMatch(/10\/12 à Marseille/);
    expect(text).toMatch(/15\/12 à Paris/);
    // CTA "Réserve ton stand" tutoiement
    expect(text).toMatch(/Réserve ton stand/);
    expect(text).toContain('https://mediadays.solutions/fr/inscription-exposant?ref=LUCAS');
    expect(text).toMatch(/À très vite,\nLucas Aubrée$/);
  });

  it('FR : ne mentionne PAS regies ni retailers (perimetre Havas, hors MDS)', () => {
    const text = buildEmailCopy('fr', {
      affilieName: 'Test',
      trackingUrlExposant: 'https://example.com',
    });
    expect(text).not.toMatch(/régies/i);
    expect(text).not.toMatch(/retailers/i);
    expect(text).not.toMatch(/UDECAM/);
  });

  it('EN : "Book your booth" + 5 tech areas + affilieName signature', () => {
    const text = buildEmailCopy('en', {
      affilieName: 'Jane Smith',
      trackingUrlExposant: 'https://mediadays.solutions/en/exhibitor-registration?ref=JANE',
    });
    expect(text).toMatch(/Hi \{first_name\}/);
    expect(text).toMatch(/5 tech areas/);
    expect(text).toMatch(/audio, broadcasting, video & CTV/);
    // Wraps across newlines : outdoor &\nDOOH
    expect(text).toMatch(/outdoor[\s\S]*?DOOH/);
    expect(text).toMatch(/data[\s\S]*?adtech/);
    // EN text wraps Nov/Dec mentions across newlines
    expect(text).toMatch(/November 26[\s\S]*?Brussels/);
    expect(text).toMatch(/December 10[\s\S]*?Marseille/);
    expect(text).toMatch(/December 15[\s\S]*?Paris/);
    // Pas de ad networks (regies) dans la nouvelle version
    expect(text).not.toMatch(/ad networks/i);
    expect(text).toMatch(/Advertisers, agencies, publishers and content producers/);
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
