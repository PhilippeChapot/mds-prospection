/**
 * @vitest-environment node
 *
 * P5.x.13-quater — tests loadLegalPage avec sanitize-html.
 *
 * On mocke fs.readFile pour controler le contenu markdown sans toucher
 * au filesystem. Cas couverts :
 *   - markdown standard (h1, h2, p, ul, a) rendu HTML safe
 *   - extraction titre du premier H1
 *   - strip du H1 du body (titre rendu separement par la page)
 *   - sanitisation : <script> XSS retire
 *   - lien externe : target + rel preserves
 *   - slug inconnu -> null
 *   - file inexistant -> null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loadLegalPage (P5.x.13-quater)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mockMd(content: string) {
    vi.doMock('node:fs/promises', () => ({
      default: {
        readFile: vi.fn().mockResolvedValue(content),
      },
    }));
  }

  it('rend markdown standard en HTML (h2, p, ul, li, code, em)', async () => {
    await mockMd(`# Mentions Légales

## Éditeur
Le site est édité par **MediaDays Solutions**.

- Adresse : Paris
- Email : philippe@mediadays.solutions

\`code inline\` et *italique*.`);
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('mentions-legales', 'fr');
    expect(page).not.toBeNull();
    expect(page!.title).toBe('Mentions Légales');
    expect(page!.html).toContain('<h2');
    expect(page!.html).toContain('<p>');
    expect(page!.html).toContain('<ul>');
    expect(page!.html).toContain('<li>');
    expect(page!.html).toContain('<strong>MediaDays Solutions</strong>');
    expect(page!.html).toContain('<code>code inline</code>');
    expect(page!.html).toContain('<em>italique</em>');
    // H1 strippe du body (rendu par la page elle-meme).
    expect(page!.html).not.toContain('<h1>Mentions Légales</h1>');
  });

  it('sanitisation XSS : <script> retire', async () => {
    await mockMd(`# Title

Texte normal.

<script>alert('xss')</script>

Suite du texte.`);
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('cgv', 'fr');
    expect(page).not.toBeNull();
    expect(page!.html).not.toContain('<script>');
    expect(page!.html).not.toContain('alert');
    expect(page!.html).toContain('Texte normal');
    expect(page!.html).toContain('Suite du texte');
  });

  it("lien externe : target='_blank' + rel='noopener' preserves", async () => {
    await mockMd(`# Title

Visitez <a href="https://example.com" target="_blank" rel="noopener">notre site</a>.`);
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('cgv', 'fr');
    expect(page!.html).toContain('href="https://example.com"');
    expect(page!.html).toContain('target="_blank"');
    expect(page!.html).toContain('rel="noopener"');
  });

  it('slug inconnu -> null', async () => {
    await mockMd('# x');
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('inexistant' as never, 'fr');
    expect(page).toBeNull();
  });

  it('file inexistant -> null (catch fs.readFile)', async () => {
    vi.doMock('node:fs/promises', () => ({
      default: {
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      },
    }));
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('cgv', 'fr');
    expect(page).toBeNull();
  });

  it('titre fallback = slug si pas de H1 detecte', async () => {
    await mockMd('Texte sans H1.');
    const { loadLegalPage } = await import('./load');
    const page = await loadLegalPage('cgv', 'fr');
    expect(page!.title).toBe('cgv');
  });
});
