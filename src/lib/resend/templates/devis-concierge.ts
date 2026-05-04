/**
 * Templates email devis_concierge — FR + EN, inline HTML + plain-text.
 *
 * Envoye apres emission d'un devis Sellsy automatique (parcours
 * devis_sepa : pas de Stripe, juste un PDF Sellsy + virement attendu).
 *
 * Variables :
 *   - firstName : prenom du contact
 *   - companyName : nom de la societe
 *   - documentNumber : reference Sellsy du devis (ex: "DEV-2026-001")
 *   - totalHt : total HT en euros (formate "12 345 €")
 *   - sellsyDocumentUrl : URL publique Sellsy du devis (PDF visible
 *     directement, pas besoin de compte Sellsy cote prospect).
 *
 * Structure responsive identique au DOI (cf. doi.ts) — meme charte MD,
 * meme media queries pour mobile.
 */

export interface DevisConciergeParams {
  firstName: string;
  companyName: string;
  documentNumber: string;
  totalHt: string; // pre-formate (ex: "12 345 €")
  sellsyDocumentUrl: string;
}

export interface DevisConciergeTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderDevisConciergeTemplate(
  locale: 'fr' | 'en',
  params: DevisConciergeParams,
): DevisConciergeTemplate {
  return locale === 'fr' ? renderFr(params) : renderEn(params);
}

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

function renderFr({
  firstName,
  companyName,
  documentNumber,
  totalHt,
  sellsyDocumentUrl,
}: DevisConciergeParams): DevisConciergeTemplate {
  return {
    subject: `Votre devis MediaDays Solutions 2026 — ${companyName}`,
    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Votre devis MediaDays Solutions 2026</title>
  <style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0; padding:0; background-color:#F5F6FA; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color:#1F2240; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F6FA; min-width:100%; width:100%;">
    <tr>
      <td align="center" class="mds-outer-padding" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header bleu marine avec logos -->
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
                Votre devis est prêt
              </h1>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Bonjour ${escapeHtml(firstName)},
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Suite à votre inscription au salon <strong>MediaDays Solutions 2026</strong> pour <strong>${escapeHtml(companyName)}</strong>, voici votre devis personnalisé&nbsp;:
              </p>

              <!-- Recap devis -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0; border:1px solid #E5E7EB; border-radius:8px; background:#F5F6FA;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin:0 0 6px 0; font-size:12px; color:#5A6080; text-transform:uppercase; letter-spacing:1px; font-weight:600;">
                      Devis ${escapeHtml(documentNumber)}
                    </p>
                    <p style="margin:0; font-size:24px; font-weight:800; color:#E6007E; font-family:'Montserrat', Helvetica, Arial, sans-serif;">
                      ${escapeHtml(totalHt)} HT
                    </p>
                    <p style="margin:6px 0 0 0; font-size:12px; color:#5A6080;">
                      TVA 20&nbsp;% applicable selon votre régime fiscal.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a class="mds-cta" href="${escapeAttr(sellsyDocumentUrl)}" style="display:inline-block; background-color:#E6007E; color:#ffffff; text-decoration:none; padding: 14px 32px; border-radius:8px; font-size:15px; font-weight:700; font-family:'Inter', Helvetica, Arial, sans-serif;">
                      Consulter mon devis
                    </a>
                  </td>
                </tr>
              </table>

              <p class="mds-text" style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#1F2240;">
                <strong>Mode de règlement&nbsp;:</strong> virement SEPA. Les coordonnées bancaires figurent sur le devis.
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#1F2240;">
                Une fois le règlement reçu, votre emplacement sera confirmé sous 48h ouvrées et vous recevrez votre facture finale.
              </p>

              <hr style="border:none; border-top:1px solid #E5E7EB; margin: 28px 0;">

              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.5; color:#5A6080;">
                Une question&nbsp;? Répondez directement à cet email, je vous reviens rapidement.<br>
                <strong>Philippe Chapot</strong> · MediaDays Solutions
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
                <a href="https://mediadays.solutions/fr/cgv" style="color:#5A6080; text-decoration:underline;">Conditions générales</a> ·
                <a href="https://mediadays.solutions/fr/mentions-legales" style="color:#5A6080; text-decoration:underline;">Mentions légales</a>
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

Votre devis MediaDays Solutions 2026 est prêt.

Devis ${documentNumber}
Total : ${totalHt} HT (TVA 20% applicable selon régime fiscal)

Consulter le devis : ${sellsyDocumentUrl}

Mode de règlement : virement SEPA (coordonnées bancaires sur le devis).
Une fois le règlement reçu, votre emplacement sera confirmé sous 48h ouvrées.

Une question ? Répondez à cet email.

—
Philippe Chapot · MediaDays Solutions

MediaDays Solutions 2026 · Paris Radio Show
10 décembre 2026 — Marseille, Palais du Pharo
15 décembre 2026 — Paris, Carrousel du Louvre

Organisé par Editions HF — Podcast & RadioHouse
8 rue Fernand Delmas, 19100 Brive, France
`,
  };
}

// ----- EN -----

function renderEn({
  firstName,
  companyName,
  documentNumber,
  totalHt,
  sellsyDocumentUrl,
}: DevisConciergeParams): DevisConciergeTemplate {
  return {
    subject: `Your MediaDays Solutions 2026 quote — ${companyName}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Your MediaDays Solutions 2026 quote</title>
  <style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0; padding:0; background-color:#F5F6FA; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color:#1F2240; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F6FA; min-width:100%; width:100%;">
    <tr>
      <td align="center" class="mds-outer-padding" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

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

          <tr>
            <td class="mds-body" style="padding: 40px 32px;">
              <h1 class="mds-headline" style="margin:0 0 20px 0; font-family:'Montserrat', Helvetica, Arial, sans-serif; font-size:24px; font-weight:800; color:#1F2240; line-height:1.3;">
                Your quote is ready
              </h1>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Hello ${escapeHtml(firstName)},
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#1F2240;">
                Following your registration to <strong>MediaDays Solutions 2026</strong> for <strong>${escapeHtml(companyName)}</strong>, here is your personalised quote:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0; border:1px solid #E5E7EB; border-radius:8px; background:#F5F6FA;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin:0 0 6px 0; font-size:12px; color:#5A6080; text-transform:uppercase; letter-spacing:1px; font-weight:600;">
                      Quote ${escapeHtml(documentNumber)}
                    </p>
                    <p style="margin:0; font-size:24px; font-weight:800; color:#E6007E; font-family:'Montserrat', Helvetica, Arial, sans-serif;">
                      ${escapeHtml(totalHt)} excl. VAT
                    </p>
                    <p style="margin:6px 0 0 0; font-size:12px; color:#5A6080;">
                      VAT 20% applicable depending on your tax regime.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a class="mds-cta" href="${escapeAttr(sellsyDocumentUrl)}" style="display:inline-block; background-color:#E6007E; color:#ffffff; text-decoration:none; padding: 14px 32px; border-radius:8px; font-size:15px; font-weight:700; font-family:'Inter', Helvetica, Arial, sans-serif;">
                      View my quote
                    </a>
                  </td>
                </tr>
              </table>

              <p class="mds-text" style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#1F2240;">
                <strong>Payment method:</strong> SEPA wire transfer. Bank details are on the quote.
              </p>
              <p class="mds-text" style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#1F2240;">
                Once payment is received, your booth will be confirmed within 48 business hours and you will receive your final invoice.
              </p>

              <hr style="border:none; border-top:1px solid #E5E7EB; margin: 28px 0;">

              <p class="mds-text" style="margin:0 0 8px 0; font-size:13px; line-height:1.5; color:#5A6080;">
                Any question? Just reply to this email, I'll get back to you quickly.<br>
                <strong>Philippe Chapot</strong> · MediaDays Solutions
              </p>
            </td>
          </tr>

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
                <a href="https://mediadays.solutions/en/terms" style="color:#5A6080; text-decoration:underline;">Terms &amp; conditions</a> ·
                <a href="https://mediadays.solutions/en/legal-notice" style="color:#5A6080; text-decoration:underline;">Legal notice</a>
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

Your MediaDays Solutions 2026 quote is ready.

Quote ${documentNumber}
Total: ${totalHt} excl. VAT (VAT 20% applicable depending on tax regime)

View the quote: ${sellsyDocumentUrl}

Payment method: SEPA wire transfer (bank details on the quote).
Once payment is received, your booth will be confirmed within 48 business hours.

Any question? Just reply to this email.

—
Philippe Chapot · MediaDays Solutions

MediaDays Solutions 2026 · Paris Radio Show
December 10, 2026 — Marseille, Palais du Pharo
December 15, 2026 — Paris, Carrousel du Louvre

Organised by Editions HF — Podcast & RadioHouse
8 rue Fernand Delmas, 19100 Brive, France
`,
  };
}

// ----- helpers -----

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
