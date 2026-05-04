/**
 * Templates DOI — FR + EN, inline HTML + plain-text.
 *
 * Source : COWORK/_brevo-templates-doi-p3.md (texte valide par Phil).
 * Contenus textuels strictement identiques au source ; seule la structure
 * HTML a ete refondue pour etre responsive et compatible 99% des clients :
 *   - Outer wrapper : table 100% width fond #F5F6FA.
 *   - Container : table width="600" + max-width:600px width:100% (responsive).
 *   - Header logos : table interne avec 2 cells + separateur, chaque PNG
 *     en 40x40 (ratio 1:1, le PNG genere est carre 160x160 retina) avec
 *     attributs HTML width/height + style + max-* pour forcer Thunderbird.
 *   - <style> mobile-first avec media queries (max-width:600px) -> padding
 *     reduit, font-size body reduit, CTA padding reduit.
 *   - Outlook MSO : pas de cas exotique a gerer (pas de bg-image, pas de
 *     gradient, pas de border-radius critique). Le border-radius du
 *     container et du CTA est ignore par Outlook desktop mais pas
 *     bloquant visuellement.
 *
 * Logos : URL absolues vers https://mediadays.solutions/brand/*.png
 *   (custom domain Vercel actif). PNG retina 160x160 generes via
 *   `pnpm tsx scripts/generate-email-logos.ts`.
 */

export interface DoiTemplateParams {
  firstName: string;
  doiUrl: string;
}

export interface DoiTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderDoiTemplate(locale: 'fr' | 'en', params: DoiTemplateParams): DoiTemplate {
  return locale === 'fr' ? renderFr(params) : renderEn(params);
}

// ----- Styles communs (media queries pour mobile) -----
//
// Volontairement minimal : on cible les paddings, font-sizes critiques et
// le CTA. Reste du layout = inline styles + attributs HTML pour fallback
// Outlook 2007/2010/2013 qui ignore <style>.
const RESPONSIVE_STYLES = `
    @media only screen and (max-width: 600px) {
      .mds-outer-padding { padding: 16px 8px !important; }
      .mds-header { padding: 20px 16px !important; }
      .mds-body { padding: 28px 20px !important; }
      .mds-headline { font-size: 20px !important; line-height: 1.3 !important; }
      .mds-text { font-size: 14px !important; }
      .mds-cta { padding: 13px 24px !important; font-size: 14px !important; }
      .mds-footer { padding: 18px 16px !important; }
      .mds-footer-text { font-size: 11px !important; }
    }
`;

// ----- FR -----

function renderFr({ firstName, doiUrl }: DoiTemplateParams): DoiTemplate {
  return {
    subject: 'Confirmez votre adresse pour finaliser votre inscription MediaDays Solutions 2026',
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Confirmation d'inscription MediaDays Solutions 2026</title>
  <style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0; padding:0; background-color:#F5F6FA; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color:#1F2240; -webkit-font-smoothing: antialiased;">
  <!-- Outer wrapper full-width -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F6FA; min-width:100%; width:100%;">
    <tr>
      <td align="center" class="mds-outer-padding" style="padding: 32px 16px;">

        <!-- Container 600px desktop, 100% mobile -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header bleu marine avec logos (table interne pour Thunderbird/Outlook) -->
          <tr>
            <td class="mds-header" style="background-color:#294294; padding: 28px 32px; text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px; vertical-align:middle;">
                    <img src="https://mediadays.solutions/brand/MDS-LogoBlanc2026-email.png" alt="MediaDays Solutions" width="40" height="40" style="display:block; width:40px; height:40px; max-width:40px; max-height:40px; border:0;">
                  </td>
                  <td style="padding: 0 8px; vertical-align:middle; color:rgba(255,255,255,0.4); font-size:24px; font-family:Arial, sans-serif; line-height:1;">|</td>
                  <td style="padding: 0 8px; vertical-align:middle;">
                    <img src="https://mediadays.solutions/brand/PRS-LogoBlanc2026-email.png" alt="Paris Radio Show" width="40" height="40" style="display:block; width:40px; height:40px; max-width:40px; max-height:40px; border:0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mds-body" style="padding: 40px 32px;">
              <h1 class="mds-headline" style="margin:0 0 20px 0; font-family:'Montserrat', Helvetica, Arial, sans-serif; font-size:24px; font-weight:800; color:#1F2240; line-height:1.3;">
                Confirmez votre adresse email
              </h1>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Bonjour ${escapeHtml(firstName)},
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Merci d'avoir entamé votre inscription à <strong>MediaDays Solutions 2026</strong>. Pour finaliser votre dossier et accéder à l'étape suivante, cliquez sur le bouton ci-dessous :
              </p>

              <!-- CTA Button magenta -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a class="mds-cta" href="${escapeAttr(doiUrl)}" style="display:inline-block; background-color:#E6007E; color:#ffffff; text-decoration:none; padding: 14px 32px; border-radius:8px; font-size:15px; font-weight:700; font-family:'Inter', Helvetica, Arial, sans-serif; mso-padding-alt: 0; mso-text-raise: 14pt;">
                      Confirmer mon adresse
                    </a>
                  </td>
                </tr>
              </table>

              <p class="mds-text" style="margin:0 0 16px 0; font-size:13px; line-height:1.6; color:#5A6080;">
                Ce lien est valable <strong>24 heures</strong>. Au-delà, vous devrez recommencer l'inscription depuis le début.
              </p>
              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#5A6080;">
                Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 24px 0; font-size:12px; line-height:1.5; color:#294294; word-break:break-all;">
                <a href="${escapeAttr(doiUrl)}" style="color:#294294; text-decoration:underline;">${escapeHtml(doiUrl)}</a>
              </p>

              <hr style="border:none; border-top:1px solid #E5E7EB; margin: 28px 0;">

              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.5; color:#5A6080;">
                Vous n'êtes pas à l'origine de cette demande ? Vous pouvez ignorer cet email, votre adresse ne sera pas utilisée.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mds-footer" style="background-color:#F5F6FA; padding: 20px 32px; text-align:center; border-top:1px solid #E5E7EB;">
              <p class="mds-footer-text" style="margin:0 0 6px 0; font-size:12px; color:#5A6080; line-height:1.5;">
                <strong>MediaDays Solutions 2026 · Paris Radio Show</strong><br>
                10 décembre 2026 — Marseille, Palais du Pharo<br>
                15 décembre 2026 — Paris, Carrousel du Louvre
              </p>
              <p class="mds-footer-text" style="margin:8px 0 0 0; font-size:11px; color:#8A92AC; line-height:1.5;">
                Organisé par <strong>Editions HF — Podcast &amp; RadioHouse</strong><br>
                8 rue Fernand Delmas, 19100 Brive, France<br>
                <a href="https://mediadays.solutions/fr/mentions-legales" style="color:#5A6080; text-decoration:underline;">Mentions légales</a> ·
                <a href="https://mediadays.solutions/fr/politique-confidentialite" style="color:#5A6080; text-decoration:underline;">Politique de confidentialité</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Bonjour ${firstName},

Merci d'avoir entamé votre inscription à MediaDays Solutions 2026.

Pour finaliser votre dossier, confirmez votre adresse email en cliquant sur le lien ci-dessous :

${doiUrl}

Ce lien est valable 24 heures. Au-delà, vous devrez recommencer l'inscription depuis le début.

Vous n'êtes pas à l'origine de cette demande ? Vous pouvez ignorer cet email, votre adresse ne sera pas utilisée.

---

MediaDays Solutions 2026 · Paris Radio Show
10 décembre 2026 — Marseille, Palais du Pharo
15 décembre 2026 — Paris, Carrousel du Louvre

Organisé par Editions HF — Podcast & RadioHouse
8 rue Fernand Delmas, 19100 Brive, France

Mentions légales : https://mediadays.solutions/fr/mentions-legales
Politique de confidentialité : https://mediadays.solutions/fr/politique-confidentialite
`,
  };
}

// ----- EN -----

function renderEn({ firstName, doiUrl }: DoiTemplateParams): DoiTemplate {
  return {
    subject: 'Confirm your email to complete your MediaDays Solutions 2026 registration',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>MediaDays Solutions 2026 — Email confirmation</title>
  <style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0; padding:0; background-color:#F5F6FA; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color:#1F2240; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F6FA; min-width:100%; width:100%;">
    <tr>
      <td align="center" class="mds-outer-padding" style="padding: 32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header navy with logos -->
          <tr>
            <td class="mds-header" style="background-color:#294294; padding: 28px 32px; text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px; vertical-align:middle;">
                    <img src="https://mediadays.solutions/brand/MDS-LogoBlanc2026-email.png" alt="MediaDays Solutions" width="40" height="40" style="display:block; width:40px; height:40px; max-width:40px; max-height:40px; border:0;">
                  </td>
                  <td style="padding: 0 8px; vertical-align:middle; color:rgba(255,255,255,0.4); font-size:24px; font-family:Arial, sans-serif; line-height:1;">|</td>
                  <td style="padding: 0 8px; vertical-align:middle;">
                    <img src="https://mediadays.solutions/brand/PRS-LogoBlanc2026-email.png" alt="Paris Radio Show" width="40" height="40" style="display:block; width:40px; height:40px; max-width:40px; max-height:40px; border:0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mds-body" style="padding: 40px 32px;">
              <h1 class="mds-headline" style="margin:0 0 20px 0; font-family:'Montserrat', Helvetica, Arial, sans-serif; font-size:24px; font-weight:800; color:#1F2240; line-height:1.3;">
                Confirm your email address
              </h1>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Hello ${escapeHtml(firstName)},
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Thanks for starting your registration to <strong>MediaDays Solutions 2026</strong>. To finalise your application and proceed to the next step, click the button below:
              </p>

              <!-- CTA Button magenta -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a class="mds-cta" href="${escapeAttr(doiUrl)}" style="display:inline-block; background-color:#E6007E; color:#ffffff; text-decoration:none; padding: 14px 32px; border-radius:8px; font-size:15px; font-weight:700; font-family:'Inter', Helvetica, Arial, sans-serif; mso-padding-alt: 0; mso-text-raise: 14pt;">
                      Confirm my email
                    </a>
                  </td>
                </tr>
              </table>

              <p class="mds-text" style="margin:0 0 16px 0; font-size:13px; line-height:1.6; color:#5A6080;">
                This link is valid for <strong>24 hours</strong>. After that, you'll need to start the registration over.
              </p>
              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:#5A6080;">
                If the button doesn't work, copy and paste this link in your browser:
              </p>
              <p style="margin:0 0 24px 0; font-size:12px; line-height:1.5; color:#294294; word-break:break-all;">
                <a href="${escapeAttr(doiUrl)}" style="color:#294294; text-decoration:underline;">${escapeHtml(doiUrl)}</a>
              </p>

              <hr style="border:none; border-top:1px solid #E5E7EB; margin: 28px 0;">

              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.5; color:#5A6080;">
                Didn't request this? You can safely ignore this email — your address won't be used.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="mds-footer" style="background-color:#F5F6FA; padding: 20px 32px; text-align:center; border-top:1px solid #E5E7EB;">
              <p class="mds-footer-text" style="margin:0 0 6px 0; font-size:12px; color:#5A6080; line-height:1.5;">
                <strong>MediaDays Solutions 2026 · Paris Radio Show</strong><br>
                December 10, 2026 — Marseille, Palais du Pharo<br>
                December 15, 2026 — Paris, Carrousel du Louvre
              </p>
              <p class="mds-footer-text" style="margin:8px 0 0 0; font-size:11px; color:#8A92AC; line-height:1.5;">
                Organised by <strong>Editions HF — Podcast &amp; RadioHouse</strong><br>
                8 rue Fernand Delmas, 19100 Brive, France<br>
                <a href="https://mediadays.solutions/en/legal-notice" style="color:#5A6080; text-decoration:underline;">Legal notice</a> ·
                <a href="https://mediadays.solutions/en/privacy-policy" style="color:#5A6080; text-decoration:underline;">Privacy policy</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Hello ${firstName},

Thanks for starting your registration to MediaDays Solutions 2026.

To finalise your application, please confirm your email address by clicking the link below:

${doiUrl}

This link is valid for 24 hours. After that, you'll need to start the registration over.

Didn't request this? You can safely ignore this email — your address won't be used.

---

MediaDays Solutions 2026 · Paris Radio Show
December 10, 2026 — Marseille, Palais du Pharo
December 15, 2026 — Paris, Carrousel du Louvre

Organised by Editions HF — Podcast & RadioHouse
8 rue Fernand Delmas, 19100 Brive, France

Legal notice: https://mediadays.solutions/en/legal-notice
Privacy policy: https://mediadays.solutions/en/privacy-policy
`,
  };
}

// ----- helpers -----

/**
 * Escape HTML pour le texte injectable (firstName saisi par l'user).
 * Pas pour le HTML structurel — c'est pourquoi on n'escape pas le whole template.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape pour les attributs HTML (href, src, etc).
 * doiUrl est genere serveur (URLSearchParams), mais on escape par defense
 * en profondeur si jamais un caractere bizarre passe.
 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
