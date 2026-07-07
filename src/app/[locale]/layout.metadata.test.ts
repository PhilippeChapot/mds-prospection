/**
 * @vitest-environment node
 *
 * SEO — verifie la presence des champs metadata cles (og:image, twitter,
 * hreflang) sans importer layout.tsx (evite de declencher les next/font
 * loaders hors contexte build Next.js).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT_SOURCE = readFileSync(join(__dirname, 'layout.tsx'), 'utf8');

describe('landing layout metadata (SEO)', () => {
  it("declare l'og:image 1200x630", () => {
    expect(LAYOUT_SOURCE).toMatch(/\/og\/og-image-mds-2026\.png/);
    expect(LAYOUT_SOURCE).toMatch(/width: 1200/);
    expect(LAYOUT_SOURCE).toMatch(/height: 630/);
  });

  it('declare une card twitter summary_large_image', () => {
    expect(LAYOUT_SOURCE).toMatch(/card: 'summary_large_image'/);
  });

  it('declare les alternates hreflang fr-FR / en-US', () => {
    expect(LAYOUT_SOURCE).toMatch(/'fr-FR': '\/fr'/);
    expect(LAYOUT_SOURCE).toMatch(/'en-US': '\/en'/);
  });

  it('autorise index/follow via robots', () => {
    expect(LAYOUT_SOURCE).toMatch(/index: true/);
    expect(LAYOUT_SOURCE).toMatch(/follow: true/);
  });
});
