/**
 * Snippets kit communication affilie — P7.x.1.E-bis (refonte B2B + 5 pôles)
 *
 * Pure functions (no DB / no React) — testables sans runtime React.
 *
 * Doctrine B2B (P7.x.1.E) : l'affiliation MDS concerne UNIQUEMENT les
 * exposants (tech audio/video/adtech/etc.). Les visiteurs ont l'entree
 * gratuite via mediadays.net et ne generent PAS de commission. Le copy
 * et la signature doivent donc orienter vers le wizard exposant
 * (`/inscription-exposant?ref=...`), pas vers la landing visiteur.
 *
 * Doctrine perimetre (P7.x.1.E-bis) : MDS est porte par Editions HF sur
 * les 5 poles tech (Audio/Diffusion/Video/Outdoor/Data). Le pole
 * REGIES & RETAIL MEDIA est porte par Havas sur mediadays.net classique
 * et N'EST PAS dans le perimetre affiliation MDS. Le copy ne doit pas
 * mentionner "regies" ni "retailers" comme audience cible.
 *
 * Wording (P7.x.1.E-bis) : "aux MediaDays" (pluriel, MediaDays prend
 * toujours un determinant pluriel — "les MediaDays" / "aux MediaDays").
 */

export interface SignatureParams {
  affilieName: string;
  /** Lien tracking vers le wizard EXPOSANT (B2B). */
  trackingUrlExposant: string;
}

/**
 * Signature email HTML pro avec :
 *   - bande verticale magenta brand
 *   - tagline MDS 2026 + 3 dates avec emojis villes
 *   - CTA principal "Réservez votre stand" (B2B)
 *   - sous-CTA secondaire mediadays.net (visiteur gratuit, sans
 *     restriction de role -- les visiteurs MDS couvrent 14 familles).
 *
 * Pas de logo en image : les clients mail filtrent souvent les remote
 * images (Gmail proxify et bloque par defaut), donc on opte pour du
 * texte brand-colored (bande gauche + #294294 marine + #E6007E magenta).
 */
export function buildEmailSignatureHtml(params: SignatureParams): string {
  const name = escapeHtml(params.affilieName);
  const exposantHref = escapeAttr(params.trackingUrlExposant);
  return [
    '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.5;">',
    '<tr>',
    '<td style="padding-right: 14px; padding-left: 12px; border-left: 3px solid #E6007E;">',
    `<strong style="color: #294294; font-size: 14px;">${name}</strong><br/>`,
    '<span style="color: #5c6b80; font-size: 12px;">Partenaire MediaDays Solutions 2026</span>',
    '</td>',
    '<td style="padding-left: 16px;">',
    '<strong style="color: #294294;">Les MediaDays Solutions 2026</strong> — Le NOUVEAU rendez-vous des médias<br/>',
    '<span style="color: #5c6b80; font-size: 11px;">Audio &middot; Diffusion &middot; Vidéo &middot; Outdoor &middot; Data &amp; adtech</span><br/>',
    '🇧🇪 26 nov Bruxelles &middot; 🇫🇷 10 déc Marseille &middot; 🇫🇷 15 déc Paris<br/>',
    `<a href="${exposantHref}" style="color: #E6007E; text-decoration: none; font-weight: 600;">→ Réservez votre stand</a><br/>`,
    '<span style="color: #5c6b80; font-size: 11px;">Vous venez visiter ? <a href="https://mediadays.net" style="color: #294294;">Inscription gratuite → mediadays.net</a></span>',
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

export interface CopyParams {
  trackingUrlExposant: string;
  /** Nom de l'affilie pour signer l'email. */
  affilieName: string;
}

/**
 * Texte type B2B a copier dans un email pro.
 *
 * Tone FR : tutoiement (les affilies MDS sont des contacts pros directs).
 * Pitch : qui sera la (regies/annonceurs/agences UDECAM/etc.) + qui devrait
 * exposer (solutions tech). CTA = wizard EXPOSANT, pas landing visiteur.
 */
export function buildEmailCopy(locale: 'fr' | 'en', params: CopyParams): string {
  if (locale === 'en') {
    return [
      'Hi {first_name},',
      '',
      'On November 26 in Brussels, December 10 in Marseille and December 15',
      'in Paris, MediaDays Solutions 2026 gathers the pro media ecosystem',
      'around 5 tech areas: audio, broadcasting, video & CTV, outdoor &',
      'DOOH, data & adtech.',
      '',
      'Advertisers, agencies, publishers and content producers come to meet',
      'their next partners. If you sell a solution in one of these 5 areas,',
      'this is THE event to land your next clients in one day.',
      '',
      `👉 Book your booth: ${params.trackingUrlExposant}`,
      '',
      'See you there,',
      params.affilieName,
    ].join('\n');
  }
  return [
    'Bonjour {prenom},',
    '',
    'Le 26/11 à Bruxelles, le 10/12 à Marseille et le 15/12 à Paris,',
    "MediaDays Solutions 2026 réunit l'écosystème pro des médias autour",
    'de 5 pôles tech : audio, diffusion, vidéo & CTV, outdoor & DOOH,',
    'data & adtech.',
    '',
    'Annonceurs, agences, éditeurs et producteurs viennent y rencontrer',
    'leurs prochains partenaires. Si tu commercialises une solution sur',
    "l'un de ces 5 pôles, c'est LE rendez-vous pour décrocher tes",
    'prochains clients en 1 journée.',
    '',
    `👉 Réserve ton stand : ${params.trackingUrlExposant}`,
    '',
    'À très vite,',
    params.affilieName,
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
