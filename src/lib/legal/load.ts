/**
 * Loader des pages légales markdown.
 *
 * - Lit le fichier .md depuis src/content/legal/<locale>/<slug>.md
 * - Parse via marked (markdown -> HTML)
 * - Sanitize via sanitize-html (defense-in-depth, meme si nos .md
 *   sont controles ; protege si on accepte du contenu utilisateur en P5+)
 * - Extrait le titre du premier h1 du fichier
 *
 * P5.x.13-quater : swap isomorphic-dompurify -> sanitize-html pour
 * eliminer la chaine de deps jsdom -> @exodus/bytes (ESM-only) qui
 * crashait Turbopack en SSR (ERR_REQUIRE_ESM). sanitize-html est
 * pure CommonJS, pas de DOM virtuel necessaire.
 *
 * Server-only : importe `node:fs` et `node:path`. Ne JAMAIS importer ce
 * helper depuis un client component.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
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
  const html = sanitizeHtml(rawHtml, {
    // sanitize-html.defaults.allowedTags couvre deja la grande majorite
    // des balises HTML utiles (p, h1-h6, ul, li, a, blockquote, code,
    // pre, table, etc.). On ajoute h1 + img par precaution (img si on
    // accepte des illustrations dans le legal a l'avenir).
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'img']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      // Liens : equivalent ADD_ATTR DOMPurify -> on autorise target/rel
      // pour les liens "open in new tab" rel="noopener".
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
  });

  return { slug, locale, title, html };
}
