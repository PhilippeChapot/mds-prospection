/**
 * @vitest-environment node
 *
 * P8.3-bis — tests wrapper template MDS.
 */

import { describe, it, expect } from 'vitest';
import { renderMdsEmailHtml } from './mds-wrapper';

describe('renderMdsEmailHtml (P8.3-bis Fix #2)', () => {
  it('inclut le body inject + le subject dans le header', () => {
    const html = renderMdsEmailHtml({
      subject: 'Hello Alice',
      bodyHtml: '<p>Mon contenu</p>',
      locale: 'fr',
      appUrl: 'https://mediadays.solutions',
    });
    expect(html).toContain('<p>Mon contenu</p>');
    expect(html).toContain('Hello Alice');
    expect(html).toContain('MediaDays Solutions 2026');
  });

  it('footer FR : adresse Editions HF + lien preferences /espace-exposant', () => {
    const html = renderMdsEmailHtml({
      subject: 'X',
      bodyHtml: '<p>X</p>',
      locale: 'fr',
      appUrl: 'https://mediadays.solutions',
    });
    expect(html).toContain('Éditions HF');
    expect(html).toContain('19100');
    expect(html).toContain('Brive-la-Gaillarde');
    expect(html).toContain('Gérer mes préférences');
    expect(html).toContain('https://mediadays.solutions/fr/espace-exposant');
  });

  it('footer EN traduit', () => {
    const html = renderMdsEmailHtml({
      subject: 'X',
      bodyHtml: '<p>X</p>',
      locale: 'en',
      appUrl: 'https://mediadays.solutions',
    });
    expect(html).toContain('Manage my preferences');
    expect(html).toContain('/en/espace-exposant');
  });

  it('styles inline (pas de Tailwind classes — compat email)', () => {
    const html = renderMdsEmailHtml({
      subject: 'X',
      bodyHtml: '<p>X</p>',
      locale: 'fr',
      appUrl: 'https://x.fr',
    });
    // Doit contenir des style="..." inline.
    expect(html).toMatch(/style="[^"]+"/);
    // Ne doit PAS contenir de classes Tailwind (bg-md-magenta etc).
    expect(html).not.toContain('class="bg-');
  });

  it('subject anti-XSS dans le header', () => {
    const html = renderMdsEmailHtml({
      subject: '<script>alert(1)</script>',
      bodyHtml: '<p>safe</p>',
      locale: 'fr',
      appUrl: 'https://x.fr',
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it("preheader cache (display:none) pour l'apercu inbox", () => {
    const html = renderMdsEmailHtml({
      subject: 'X',
      bodyHtml: '<p>X</p>',
      locale: 'fr',
      appUrl: 'https://x.fr',
    });
    expect(html).toContain('display:none');
  });
});
