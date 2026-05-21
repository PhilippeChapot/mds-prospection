/**
 * Template email "commission payée" affilie — P7.x.1.C
 *
 * Envoye apres `markCommissionPaidAction` admin (transition `due` -> `paid`
 * dans le schema existant). Confirme le virement effectif + reference.
 *
 * IBAN affiche masque (helper maskIban) pour confidentialite.
 *
 * FR uniquement V1.
 */

import { capitalizeName } from '@/lib/format/name';
import { maskIban } from '@/lib/affilie/iban-mask';

export interface AffilieCommissionPaidParams {
  affilieName: string;
  amountEurHt: number;
  paidAt: string;
  paymentReference: string;
  /** IBAN brut — sera masque par maskIban. */
  iban: string | null;
  dashboardUrl: string;
}

export interface AffilieCommissionPaidTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderAffilieCommissionPaid(
  params: AffilieCommissionPaidParams,
): AffilieCommissionPaidTemplate {
  const name = capitalizeName(params.affilieName);
  const fmtEur = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
  const fmtDate = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const amount = fmtEur.format(params.amountEurHt);
  const paidAtPretty = fmtDate.format(new Date(params.paidAt));
  const ibanMasked = maskIban(params.iban);

  const subject = `[MDS 2026] Virement effectué — ${amount} — Réf ${params.paymentReference}`;
  const dashboardPaiements = `${params.dashboardUrl}/dashboard/paiements`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px">✅ Virement effectué</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026 · Programme Affiliés</p>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.55">
      <p style="margin:0 0 14px">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">Votre commission de <strong style="color:#E6007E">${escapeHtml(amount)} HT</strong> a été virée le <strong>${escapeHtml(paidAtPretty)}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:8px 12px;background:#f4f6fb;font-weight:600;color:#031A56;width:160px">Référence virement</td><td style="padding:8px 12px;font-family:monospace;background:#f4f6fb">${escapeHtml(params.paymentReference)}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:600;color:#031A56;width:160px">Compte crédité</td><td style="padding:8px 12px;font-family:monospace">${escapeHtml(ibanMasked)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f4f6fb;font-weight:600;color:#031A56;width:160px">Date du virement</td><td style="padding:8px 12px;background:#f4f6fb">${escapeHtml(paidAtPretty)}</td></tr>
      </table>
      <p style="margin:24px 0;text-align:center">
        <a href="${escapeAttr(dashboardPaiements)}" style="display:inline-block;padding:12px 22px;background:#E6007E;color:white;text-decoration:none;border-radius:8px;font-weight:600">📊 Voir mes commissions</a>
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:13px">Merci pour votre fidélité et votre apport au programme MediaDays Solutions !<br><br>L'équipe MediaDays Solutions</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Bonjour ${name},`,
    '',
    `Votre commission de ${amount} HT a été virée le ${paidAtPretty}.`,
    '',
    `Référence virement : ${params.paymentReference}`,
    `Compte crédité : ${ibanMasked}`,
    `Date du virement : ${paidAtPretty}`,
    '',
    `Voir vos commissions : ${dashboardPaiements}`,
    '',
    'Merci pour votre fidélité et votre apport au programme MediaDays Solutions !',
    '',
    "L'équipe MediaDays Solutions",
  ].join('\n');

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
