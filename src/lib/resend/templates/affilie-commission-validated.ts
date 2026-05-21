/**
 * Template email "commission validée" affilie — P7.x.1.C
 *
 * Envoye automatiquement quand le webhook `maybeRecordAffiliateCommission`
 * calcule la commission (acompte payé) — equivalent du "validated" du
 * brief avec le schema existant `commission_status='due'`.
 *
 * FR uniquement V1. EN ajoutable en V2 si Phil onboarde des affilies
 * anglophones.
 */

import { capitalizeName } from '@/lib/format/name';

export interface AffilieCommissionValidatedParams {
  affilieName: string;
  prospectCompany: string;
  amountEurHt: number;
  dashboardUrl: string;
}

export interface AffilieCommissionEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderAffilieCommissionValidated(
  params: AffilieCommissionValidatedParams,
): AffilieCommissionEmailTemplate {
  const name = capitalizeName(params.affilieName);
  const fmtEur = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
  const amount = fmtEur.format(params.amountEurHt);
  const subject = `[MDS 2026] Votre commission de ${amount} est validée`;

  const dashboardPaiements = `${params.dashboardUrl}/dashboard/paiements`;
  const dashboardProfil = `${params.dashboardUrl}/dashboard/profil`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px">🎉 Commission validée</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026 · Programme Affiliés</p>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:14px;line-height:1.55">
      <p style="margin:0 0 14px">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">Bonne nouvelle ! Une commission de <strong style="color:#E6007E">${escapeHtml(amount)} HT</strong> a été validée pour votre apport de <strong>${escapeHtml(params.prospectCompany)}</strong>.</p>
      <p style="margin:0 0 14px">Le virement sera effectué prochainement sur le compte bancaire que vous avez renseigné dans votre Espace Affilié.</p>
      <p style="margin:24px 0;text-align:center">
        <a href="${escapeAttr(dashboardPaiements)}" style="display:inline-block;padding:12px 22px;background:#E6007E;color:white;text-decoration:none;border-radius:8px;font-weight:600">📊 Voir mes commissions</a>
      </p>
      <p style="margin:0 0 8px;color:#5c6b80;font-size:13px">
        💡 Vos coordonnées bancaires ne sont pas à jour ? Mettez-les à jour
        <a href="${escapeAttr(dashboardProfil)}" style="color:#E6007E">dans votre profil</a>.
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:13px">À très vite,<br>L'équipe MediaDays Solutions</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Bonjour ${name},`,
    '',
    `Bonne nouvelle ! Une commission de ${amount} HT a été validée pour votre apport de ${params.prospectCompany}.`,
    '',
    'Le virement sera effectué prochainement sur le compte bancaire que vous avez renseigné dans votre Espace Affilié.',
    '',
    `Voir vos commissions : ${dashboardPaiements}`,
    `Mettre à jour vos coordonnées bancaires : ${dashboardProfil}`,
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
