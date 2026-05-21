/**
 * @vitest-environment node
 *
 * P7.x.1.C — tests pures snippets kit communication.
 */

import { describe, it, expect } from 'vitest';
import { buildEmailSignatureHtml, buildEmailCopy } from './snippets';

describe('buildEmailSignatureHtml (P7.x.1.C)', () => {
  it('rend une table HTML inline avec le nom + lien tracking', () => {
    const html = buildEmailSignatureHtml({
      affilieName: 'Lucas Aubrée',
      trackingUrl: 'https://mediadays.solutions/fr?ref=LUCAS',
    });
    expect(html).toMatch(/<table/);
    expect(html).toMatch(/Lucas Aubrée/);
    expect(html).toMatch(/Partenaire MediaDays Solutions 2026/);
    expect(html).toMatch(/href="https:\/\/mediadays\.solutions\/fr\?ref=LUCAS"/);
    // Brand colors MDS (magenta + bleu)
    expect(html).toContain('#E6007E');
    expect(html).toContain('#294294');
  });

  it('echappe HTML (anti-injection sur affilieName)', () => {
    const html = buildEmailSignatureHtml({
      affilieName: '<script>alert(1)</script>',
      trackingUrl: 'https://example.com',
    });
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
});

describe('buildEmailCopy (P7.x.1.C)', () => {
  it('FR : 26 nov / 10 dec / 15 dec + lien tracking', () => {
    const text = buildEmailCopy('fr', { trackingUrl: 'https://mediadays.solutions/fr?ref=X' });
    expect(text).toMatch(/Bonjour \{prenom\}/);
    expect(text).toMatch(/MediaDays Solutions 2026/);
    expect(text).toMatch(/26 nov.*10 déc.*15 déc/);
    expect(text).toContain('https://mediadays.solutions/fr?ref=X');
  });

  it('EN : matches localized dates Nov 26 / Dec 10 / Dec 15', () => {
    const text = buildEmailCopy('en', { trackingUrl: 'https://example.com?ref=Y' });
    expect(text).toMatch(/Hi \{first_name\}/);
    expect(text).toMatch(/Nov 26.*Dec 10.*Dec 15/);
    expect(text).toContain('https://example.com?ref=Y');
  });
});
