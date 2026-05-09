/**
 * Templates emails admin Stripe — notifications a l'equipe pour
 * paiements reussis / echoues.
 *
 * Sobre, monolingue FR (admins MDS), pas de charte fancy : c'est un
 * email interne actionnable.
 */

export interface AdminPaymentParams {
  prospectId: string;
  prospectUrl: string;
  companyName: string;
  contactEmail: string;
  amountEur: string; // pre-formate "1 200,00 €"
  documentNumber: string | null;
  paymentType: 'acompte_30pct' | 'integral' | 'concierge';
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
}

export interface AdminPaymentTemplate {
  subject: string;
  html: string;
  text: string;
}

const ADMIN_BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 24px;
`;

export function renderAdminAcomptePayeEmail(p: AdminPaymentParams): AdminPaymentTemplate {
  const typeLabel =
    p.paymentType === 'acompte_30pct'
      ? 'Acompte 30%'
      : p.paymentType === 'integral'
        ? 'Paiement intégral'
        : 'Lien concierge';

  const subject = `[MDS] ${typeLabel} encaissé — ${p.companyName} (${p.amountEur})`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #1fbf7a;">Paiement Stripe encaissé ✓</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">${typeLabel} reçu de <strong>${p.companyName}</strong>.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Montant</td><td style="text-align: right; font-weight: 600;">${p.amountEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Société</td><td style="text-align: right;">${p.companyName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right;">${p.contactEmail}</td></tr>
          ${p.documentNumber ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Devis Sellsy</td><td style="text-align: right;">${p.documentNumber}</td></tr>` : ''}
          ${p.stripeSessionId ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Session Stripe</td><td style="text-align: right; font-family: monospace; font-size: 12px;">${p.stripeSessionId}</td></tr>` : ''}
          ${p.stripePaymentIntentId ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Payment Intent</td><td style="text-align: right; font-family: monospace; font-size: 12px;">${p.stripePaymentIntentId}</td></tr>` : ''}
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Paiement Stripe encaisse - ${typeLabel}`,
    ``,
    `Montant : ${p.amountEur}`,
    `Societe : ${p.companyName}`,
    `Contact : ${p.contactEmail}`,
    p.documentNumber ? `Devis Sellsy : ${p.documentNumber}` : '',
    p.stripeSessionId ? `Session Stripe : ${p.stripeSessionId}` : '',
    p.stripePaymentIntentId ? `Payment Intent : ${p.stripePaymentIntentId}` : '',
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

/**
 * Template distinct pour les paiements concierge (Payment Link Stripe
 * a montant libre, cree par l'admin via dialog). Le wording n'utilise
 * pas "Acompte 30%" car le montant peut etre 100% du devis ou autre.
 *
 * Bug B (P4.x.1) : route via metadata.flow=concierge dans le webhook.
 */
export function renderAdminConciergePayeEmail(p: AdminPaymentParams): AdminPaymentTemplate {
  const subject = `[MDS] Lien concierge encaissé — ${p.companyName} (${p.amountEur})`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #1fbf7a;">Paiement Stripe encaissé ✓</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">Lien concierge reçu de <strong>${p.companyName}</strong> (montant libre saisi côté admin).</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Montant</td><td style="text-align: right; font-weight: 600;">${p.amountEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Société</td><td style="text-align: right;">${p.companyName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right;">${p.contactEmail}</td></tr>
          ${p.documentNumber ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Devis Sellsy</td><td style="text-align: right;">${p.documentNumber}</td></tr>` : ''}
          ${p.stripeSessionId ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Session Stripe</td><td style="text-align: right; font-family: monospace; font-size: 12px;">${p.stripeSessionId}</td></tr>` : ''}
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Paiement concierge encaisse`,
    ``,
    `Montant : ${p.amountEur}`,
    `Societe : ${p.companyName}`,
    `Contact : ${p.contactEmail}`,
    p.documentNumber ? `Devis Sellsy : ${p.documentNumber}` : '',
    p.stripeSessionId ? `Session Stripe : ${p.stripeSessionId}` : '',
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

export function renderAdminAcompteEchecEmail(
  p: AdminPaymentParams & { errorMessage?: string },
): AdminPaymentTemplate {
  const subject = `[MDS] Paiement Stripe échoué — ${p.companyName}`;

  const html = `
    <div style="${ADMIN_BASE_STYLES}">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e5484d33; border-radius: 12px; padding: 28px;">
        <h2 style="margin: 0 0 8px; color: #e5484d;">Paiement Stripe échoué ✗</h2>
        <p style="margin: 0 0 20px; color: #5c6b85;">Le paiement de <strong>${p.companyName}</strong> n'a pas pu être finalisé.</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Montant tenté</td><td style="text-align: right; font-weight: 600;">${p.amountEur}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Société</td><td style="text-align: right;">${p.companyName}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Contact</td><td style="text-align: right;">${p.contactEmail}</td></tr>
          ${p.errorMessage ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Erreur</td><td style="text-align: right; color: #e5484d;">${p.errorMessage}</td></tr>` : ''}
        </table>
        <p style="margin: 24px 0 0;">
          <a href="${p.prospectUrl}" style="display: inline-block; padding: 10px 20px; background: #294294; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le prospect</a>
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Paiement Stripe ECHOUE`,
    ``,
    `Montant tente : ${p.amountEur}`,
    `Societe : ${p.companyName}`,
    `Contact : ${p.contactEmail}`,
    p.errorMessage ? `Erreur : ${p.errorMessage}` : '',
    ``,
    `Fiche prospect : ${p.prospectUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}
