/**
 * P8.3-bis — wrapper template MDS pour les emails de campagne inline.
 *
 * Encapsule un body HTML libre dans une enveloppe brandée MDS (header
 * logo + couleurs + footer Editions HF + désinscription RGPD). Tout en
 * styles INLINE pour la compat email (Gmail, Outlook, Apple Mail).
 *
 * Application : appelee depuis lib/brevo/send-campaign.ts AVANT l'envoi
 * Brevo, UNIQUEMENT en mode content_mode='inline' (les templates Brevo
 * ont leur propre design — on ne les wrappe pas).
 *
 * Pattern visuel aligne avec les templates Resend existants
 * (lib/resend/templates/visitor-reply.ts, institutionnel-ecole-request.ts).
 */

export interface MdsEmailWrapperParams {
  /** Sujet (affiche dans le header, deja personnalise). */
  subject: string;
  /** Body HTML inline (deja personnalise {prenom}/{societe}/{etape}). */
  bodyHtml: string;
  /** Locale pour le wording du footer. */
  locale: 'fr' | 'en';
  /** App base URL pour le lien preferences (/espace-partenaire). */
  appUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COPY = {
  fr: {
    preheader: 'MediaDays Solutions',
    footerAddr: 'Éditions HF · 19 rue de la République, 19100 Brive-la-Gaillarde, France',
    footerReason:
      'Vous recevez cet email parce que vous avez opté pour cette catégorie de communication.',
    preferences: 'Gérer mes préférences / Me désinscrire',
    legal: 'Mentions légales',
    legalUrl: '/fr/mentions-legales',
    privacy: 'Politique de confidentialité',
    privacyUrl: '/fr/politique-confidentialite',
  },
  en: {
    preheader: 'MediaDays Solutions',
    footerAddr: 'Éditions HF · 19 rue de la République, 19100 Brive-la-Gaillarde, France',
    footerReason: 'You receive this email because you opted in to this communication category.',
    preferences: 'Manage my preferences / Unsubscribe',
    legal: 'Legal notice',
    legalUrl: '/en/mentions-legales',
    privacy: 'Privacy policy',
    privacyUrl: '/en/politique-confidentialite',
  },
} as const;

/**
 * Wrappe un body HTML dans l'enveloppe MDS branded. Styles inline.
 */
export function renderMdsEmailHtml(params: MdsEmailWrapperParams): string {
  const copy = COPY[params.locale];
  const prefsUrl = `${params.appUrl}/${params.locale}/espace-partenaire`;
  const legalUrl = `${params.appUrl}${copy.legalUrl}`;
  const privacyUrl = `${params.appUrl}${copy.privacyUrl}`;

  return `<!DOCTYPE html><html lang="${params.locale}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222">
  <!-- Preheader hidden (apercu inbox) -->
  <div style="display:none;max-height:0;overflow:hidden;visibility:hidden">${escapeHtml(copy.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7fb;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

        <!-- Header MDS : magenta accent + titre -->
        <tr><td style="background:#031A56;padding:24px 28px;color:#ffffff">
          <p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;color:#FF4DA0">MediaDays Solutions 2026</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#ffffff">${escapeHtml(params.subject)}</p>
        </td></tr>

        <!-- Body inject -->
        <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#333">
          ${params.bodyHtml}
        </td></tr>

        <!-- Footer RGPD + adresse -->
        <tr><td style="background:#f6f7fb;padding:18px 28px;border-top:1px solid #e5e7eb">
          <p style="margin:0 0 8px;font-size:11px;color:#666;line-height:1.6">
            ${escapeHtml(copy.footerReason)}<br/>
            <a href="${escapeHtml(prefsUrl)}" style="color:#031A56;text-decoration:underline">${escapeHtml(copy.preferences)}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#888;line-height:1.5">
            ${escapeHtml(copy.footerAddr)}<br/>
            <a href="${escapeHtml(legalUrl)}" style="color:#888;text-decoration:underline">${escapeHtml(copy.legal)}</a>
            &nbsp;·&nbsp;
            <a href="${escapeHtml(privacyUrl)}" style="color:#888;text-decoration:underline">${escapeHtml(copy.privacy)}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}
