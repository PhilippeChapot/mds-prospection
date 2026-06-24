/**
 * P12.x.EmailIntegration — variables de template + conversion texte→HTML.
 * Pur, testable.
 */

/** Remplace {contact.first_name} {company.name} {prospect.amount}… */
export function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z._]+)\}/gi, (m, key) => vars[key] ?? m);
}

/**
 * Les templates seedés (migration 0106) ont été stockés avec des séquences
 * littérales "\n" (chaîne SQL standard, pas E'') → on les convertit en vrais
 * sauts de ligne. No-op si le texte contient déjà de vrais \n.
 */
export function normalizeTemplateNewlines(text: string): string {
  return text.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Convertit un body texte (avec vrais \n) en HTML : double saut = paragraphe,
 * simple saut = <br>. Échappe le HTML.
 */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}
