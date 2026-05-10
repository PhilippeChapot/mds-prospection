/**
 * Template prospect (FR/EN) — envoi du lien de paiement Stripe pour
 * l'acompte 30% (P4.x.2 sujet D, payment_path=devis_acompte_stripe).
 *
 * Envoye automatiquement apres emission du devis Sellsy si le prospect
 * a choisi "Devis avec acompte Stripe" au wizard public.
 *
 * Variables :
 *   - firstName, companyName
 *   - documentNumber (ex: D-20260509-02693)
 *   - sellsyDocumentUrl (lien public Sellsy du devis)
 *   - paymentLinkUrl (lien Stripe Payment Link)
 *   - acompteAmount (formate "2 746,80 €")
 *   - resteDuAmount (formate, optionnel — solde apres acompte)
 *
 * Charte responsive identique aux autres templates (DOI, devis_concierge).
 */

export interface ProspectAcomptePaymentLinkParams {
  firstName: string;
  companyName: string;
  documentNumber: string;
  sellsyDocumentUrl: string;
  paymentLinkUrl: string;
  acompteAmount: string;
  resteDuAmount?: string;
  /**
   * P5.x.1 — true si le devis Sellsy est emis en autoliquidation TVA
   * (UE non-FR + numero verifie). Affiche une mention "Art. 196" sous
   * le bloc montants pour rassurer le client UE sur le HT-only.
   */
  autoliquidation?: boolean;
}

export interface ProspectAcomptePaymentLinkTemplate {
  subject: string;
  html: string;
  text: string;
}

import { capitalizeName } from '@/lib/format/name';

export function renderProspectAcomptePaymentLinkTemplate(
  locale: 'fr' | 'en',
  params: ProspectAcomptePaymentLinkParams,
): ProspectAcomptePaymentLinkTemplate {
  // P5.x.5 : normalise le prenom a l'affichage (cf. capitalizeName helper).
  const normalized = { ...params, firstName: capitalizeName(params.firstName) };
  return locale === 'fr' ? renderFr(normalized) : renderEn(normalized);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function renderFr(p: ProspectAcomptePaymentLinkParams): ProspectAcomptePaymentLinkTemplate {
  const subject = `Votre devis MediaDays Solutions 2026 + lien de paiement de l'acompte`;

  // P4.x.4 Bug L : si companyName est vide/manquant, on omet le "pour X"
  // pour eviter "pour ." en suspens. Phrase alternative plus generique.
  const greetingFr = p.companyName.trim()
    ? `Nous avons le plaisir de vous adresser le devis MediaDays Solutions 2026 pour <strong>${escapeHtml(p.companyName)}</strong>.`
    : `Nous avons le plaisir de vous adresser votre devis MediaDays Solutions 2026.`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 20px; line-height: 1.55;">
          ${greetingFr}
        </p>

        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px; margin: 0 0 24px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Devis</td><td style="text-align: right; font-family: monospace;">${escapeHtml(p.documentNumber)}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">Acompte 30% à régler</td><td style="text-align: right; font-weight: 700; color: #294294;">${escapeHtml(p.acompteAmount)}</td></tr>
          ${p.resteDuAmount ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Solde après acompte</td><td style="text-align: right;">${escapeHtml(p.resteDuAmount)}</td></tr>` : ''}
        </table>
        ${
          p.autoliquidation
            ? `<p style="margin: -8px 0 24px; font-size: 12px; color: #5c6b85; line-height: 1.5;"><em>TVA autoliquidée par le preneur — Article 196 directive 2006/112/CE. Montants en HT.</em></p>`
            : ''
        }

        <p style="margin: 0 0 12px; line-height: 1.55;">
          <strong>1. Consultez votre devis détaillé :</strong>
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.sellsyDocumentUrl)}" style="display: inline-block; padding: 12px 24px; background: #fff; color: #294294; text-decoration: none; border-radius: 8px; border: 1.5px solid #294294; font-weight: 600;">Consulter le devis</a>
        </p>

        <p style="margin: 0 0 12px; line-height: 1.55;">
          <strong>2. Confirmez votre inscription en réglant l'acompte 30% :</strong>
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.paymentLinkUrl)}" style="display: inline-block; padding: 12px 24px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Régler l'acompte (${escapeHtml(p.acompteAmount)})</a>
        </p>
        <p style="margin: 0 0 24px; font-size: 12px; color: #5c6b85; line-height: 1.5;">
          Paiement sécurisé Stripe (carte bancaire). Reçu envoyé automatiquement à l'adresse de facturation.
          ${p.resteDuAmount ? `Le solde de ${escapeHtml(p.resteDuAmount)} sera à régler 30 jours avant l'événement (15 décembre 2026).` : ''}
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Une question sur le devis ou le paiement ? Répondez simplement à cet email.
        </p>
        <p style="margin: 16px 0 0; font-size: 13px; color: #5c6b85;">
          À très vite,<br />
          Philippe Chapot — MediaDays Solutions
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Bonjour ${p.firstName},`,
    ``,
    p.companyName.trim()
      ? `Voici votre devis MediaDays Solutions 2026 pour ${p.companyName}.`
      : `Voici votre devis MediaDays Solutions 2026.`,
    ``,
    `Devis : ${p.documentNumber}`,
    `Acompte 30% a regler : ${p.acompteAmount}`,
    p.resteDuAmount ? `Solde apres acompte : ${p.resteDuAmount}` : '',
    p.autoliquidation
      ? `TVA autoliquidee par le preneur — Article 196 directive 2006/112/CE. Montants en HT.`
      : '',
    ``,
    `1. Consulter le devis : ${p.sellsyDocumentUrl}`,
    `2. Regler l'acompte : ${p.paymentLinkUrl}`,
    ``,
    `Paiement securise Stripe.`,
    p.resteDuAmount
      ? `Solde de ${p.resteDuAmount} a regler 30 jours avant l'evenement (15 decembre 2026).`
      : '',
    ``,
    `Une question ? Repondez a cet email.`,
    `Philippe Chapot — MediaDays Solutions`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

function renderEn(p: ProspectAcomptePaymentLinkParams): ProspectAcomptePaymentLinkTemplate {
  const subject = `Your MediaDays Solutions 2026 quote + deposit payment link`;

  // P4.x.4 Bug L : si companyName est vide, on omet le "for X" pour
  // eviter "for ." en suspens.
  const greetingEn = p.companyName.trim()
    ? `We are pleased to share your MediaDays Solutions 2026 quote for <strong>${escapeHtml(p.companyName)}</strong>.`
    : `We are pleased to share your MediaDays Solutions 2026 quote.`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 20px; line-height: 1.55;">
          ${greetingEn}
        </p>

        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px; margin: 0 0 24px;">
          <tr><td style="padding: 6px 0; color: #5c6b85;">Quote</td><td style="text-align: right; font-family: monospace;">${escapeHtml(p.documentNumber)}</td></tr>
          <tr><td style="padding: 6px 0; color: #5c6b85;">30% deposit due</td><td style="text-align: right; font-weight: 700; color: #294294;">${escapeHtml(p.acompteAmount)}</td></tr>
          ${p.resteDuAmount ? `<tr><td style="padding: 6px 0; color: #5c6b85;">Balance after deposit</td><td style="text-align: right;">${escapeHtml(p.resteDuAmount)}</td></tr>` : ''}
        </table>
        ${
          p.autoliquidation
            ? `<p style="margin: -8px 0 24px; font-size: 12px; color: #5c6b85; line-height: 1.5;"><em>VAT reverse-charged to the recipient — Article 196 of Directive 2006/112/EC. Amounts excluding VAT.</em></p>`
            : ''
        }

        <p style="margin: 0 0 12px; line-height: 1.55;"><strong>1. Review your detailed quote:</strong></p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.sellsyDocumentUrl)}" style="display: inline-block; padding: 12px 24px; background: #fff; color: #294294; text-decoration: none; border-radius: 8px; border: 1.5px solid #294294; font-weight: 600;">View quote</a>
        </p>

        <p style="margin: 0 0 12px; line-height: 1.55;"><strong>2. Confirm your registration by paying the 30% deposit:</strong></p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.paymentLinkUrl)}" style="display: inline-block; padding: 12px 24px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Pay deposit (${escapeHtml(p.acompteAmount)})</a>
        </p>
        <p style="margin: 0 0 24px; font-size: 12px; color: #5c6b85; line-height: 1.5;">
          Secure Stripe payment (credit card). Receipt sent automatically.
          ${p.resteDuAmount ? `Balance of ${escapeHtml(p.resteDuAmount)} due 30 days before the event (December 15, 2026).` : ''}
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Question about the quote or payment? Just reply to this email.
        </p>
        <p style="margin: 16px 0 0; font-size: 13px; color: #5c6b85;">
          Looking forward,<br />
          Philippe Chapot — MediaDays Solutions
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Hi ${p.firstName},`,
    ``,
    p.companyName.trim()
      ? `Your MediaDays Solutions 2026 quote for ${p.companyName} is ready.`
      : `Your MediaDays Solutions 2026 quote is ready.`,
    ``,
    `Quote: ${p.documentNumber}`,
    `30% deposit due: ${p.acompteAmount}`,
    p.resteDuAmount ? `Balance after deposit: ${p.resteDuAmount}` : '',
    p.autoliquidation
      ? `VAT reverse-charged to the recipient — Article 196 of Directive 2006/112/EC. Amounts excluding VAT.`
      : '',
    ``,
    `1. View quote: ${p.sellsyDocumentUrl}`,
    `2. Pay deposit: ${p.paymentLinkUrl}`,
    ``,
    `Secure Stripe payment.`,
    p.resteDuAmount
      ? `Balance of ${p.resteDuAmount} due 30 days before the event (December 15, 2026).`
      : '',
    ``,
    `Question? Just reply to this email.`,
    `Philippe Chapot — MediaDays Solutions`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
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
