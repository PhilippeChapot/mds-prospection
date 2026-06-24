/**
 * @vitest-environment node
 *
 * P12.x micro-fix — normalizeTemplateNewlines + textToHtml.
 */

import { describe, it, expect } from 'vitest';
import { applyTemplateVars, normalizeTemplateNewlines, textToHtml } from './template-vars';

describe('normalizeTemplateNewlines (P12.x fix)', () => {
  it('convertit les "\\n" littéraux en vrais sauts de ligne', () => {
    // Source : 'a' + backslash-n + backslash-n + 'b' (comme stocké en 0106).
    expect(normalizeTemplateNewlines('a\\n\\nb')).toBe('a\n\nb');
  });

  it('laisse les vrais \\n intacts (no-op)', () => {
    expect(normalizeTemplateNewlines('a\n\nb')).toBe('a\n\nb');
  });
});

describe('textToHtml (P12.x fix)', () => {
  it('double saut → paragraphes', () => {
    expect(textToHtml('Bonjour\n\nMerci')).toBe('<p>Bonjour</p>\n<p>Merci</p>');
  });

  it('simple saut → <br>', () => {
    expect(textToHtml('ligne1\nligne2')).toBe('<p>ligne1<br>ligne2</p>');
  });

  it('échappe le HTML', () => {
    expect(textToHtml('a <b> c')).toBe('<p>a &lt;b&gt; c</p>');
  });
});

describe('applyTemplateVars + normalize (P12.x fix combiné)', () => {
  it('interpole après normalisation des newlines', () => {
    const raw = 'Bonjour {contact.first_name},\\n\\nMerci.';
    const out = applyTemplateVars(normalizeTemplateNewlines(raw), {
      'contact.first_name': 'Jean',
    });
    expect(out).toBe('Bonjour Jean,\n\nMerci.');
  });
});
