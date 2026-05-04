/**
 * Loader des pages légales markdown.
 *
 * - Lit le fichier .md depuis src/content/legal/<locale>/<slug>.md
 * - Parse via marked (markdown -> HTML)
 * - Sanitize via isomorphic-dompurify (defense-in-depth, meme si nos .md
 *   sont controles ; protege si on accepte du contenu utilisateur en P5+)
 * - Extrait le titre du premier h1 du fichier
 *
 * Server-only : importe `node:fs` et `node:path`. Ne JAMAIS importer ce
 * helper depuis un client component.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import type { AppLocale } from '@/i18n/routing';

/**
 * Mapping interne (cle de pathnames) -> nom de fichier .md selon locale.
 * Le routing next-intl rewrite les slugs EN vers les cles internes FR.
 */
const SLUG_TO_FILE: Record<string, Record<AppLocale, string>> = {
  cgv: { fr: 'cgv', en: 'terms' },
  'mentions-legales': { fr: 'mentions-legales', en: 'legal-notice' },
  'politique-confidentialite': {
    fr: 'politique-confidentialite',
    en: 'privacy-policy',
  },
};

export const LEGAL_SLUGS = Object.keys(SLUG_TO_FILE);
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export interface LegalPage {
  slug: LegalSlug;
  locale: AppLocale;
  title: string;
  html: string;
}

/**
 * Configure marked une fois pour toutes :
 *  - GFM activé (tables, listes coches, etc.)
 *  - breaks: false (les retours simples ne deviennent pas <br>)
 */
marked.setOptions({
  gfm: true,
  breaks: false,
});

function extractTitle(markdown: string, fallback: string): string {
  // Premier h1 du fichier (ligne commencant par "# ").
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
}

export async function loadLegalPage(slug: LegalSlug, locale: AppLocale): Promise<LegalPage | null> {
  const fileBasename = SLUG_TO_FILE[slug]?.[locale];
  if (!fileBasename) return null;

  const filePath = path.join(
    process.cwd(),
    'src',
    'content',
    'legal',
    locale,
    `${fileBasename}.md`,
  );

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const title = extractTitle(raw, slug);
  // Strip le H1 du markdown pour eviter le doublon (la page rendra le title
  // dans le header, pas dans le body).
  const body = raw.replace(/^#\s+.+\r?\n/m, '');

  const rawHtml = await marked.parse(body, { async: true });
  const html = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  });

  return { slug, locale, title, html };
}
