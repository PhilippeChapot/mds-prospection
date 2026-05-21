/**
 * Snippets kit communication affilie — P7.x.1.C
 *
 * Pure functions (no DB / no React) :
 *   - buildEmailSignatureHtml : table HTML inline 2 colonnes, brandee MDS
 *   - buildEmailCopy(locale)  : texte type a copier dans un email perso
 */

export interface SignatureParams {
  affilieName: string;
  trackingUrl: string;
}

export function buildEmailSignatureHtml(params: SignatureParams): string {
  const name = escapeHtml(params.affilieName);
  const href = escapeAttr(params.trackingUrl);
  return [
    '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.45;">',
    '<tr>',
    '<td style="padding-right: 12px; border-right: 2px solid #E6007E;">',
    `<strong style="color: #294294;">${name}</strong><br/>`,
    'Partenaire MediaDays Solutions 2026',
    '</td>',
    '<td style="padding-left: 12px;">',
    '<strong>10 déc Marseille &middot; 15 déc Paris &middot; 26 nov Bruxelles</strong><br/>',
    `<a href="${href}" style="color: #E6007E; text-decoration: none;">→ Inscrivez-vous (entrée gratuite)</a>`,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

export function buildEmailCopy(locale: 'fr' | 'en', params: { trackingUrl: string }): string {
  if (locale === 'en') {
    return [
      'Hi {first_name},',
      '',
      "I'm attending MediaDays Solutions 2026, the pro media event in Paris,",
      'Marseille and Brussels (Nov 26 / Dec 10 / Dec 15). Entry is free for',
      'qualified professionals.',
      '',
      `Register here: ${params.trackingUrl}`,
      '',
      'See you there!',
    ].join('\n');
  }
  return [
    'Bonjour {prenom},',
    '',
    'Je participe à MediaDays Solutions 2026, le rendez-vous pro des médias',
    "à Paris, Marseille et Bruxelles (26 nov / 10 déc / 15 déc). L'entrée est",
    'gratuite pour les professionnels qualifiés.',
    '',
    `Inscrivez-vous ici : ${params.trackingUrl}`,
    '',
    'À très bientôt,',
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
