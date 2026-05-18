/**
 * P6.x.5-nonies — Template email "Devis mis à jour" envoyé au prospect
 * quand l'admin re-émet un devis via le Devis Builder (l'ancien est annulé).
 *
 * Aligné sur la charte des autres templates MDS (devis-concierge.ts) : HTML
 * inline + plain-text, FR + EN selon contact.language.
 */

import { capitalizeName } from '@/lib/format/name';

export interface ProspectDevisUpdatedParams {
  firstName: string;
  companyName: string;
  /** Nouveau numéro Sellsy (ex. "D-20260519-00001"). */
  newDevisNumber: string;
  /** Numéro de l'ancien devis annulé. Inclus dans le mail pour rappel client. */
  oldDevisNumber: string | null;
  /** Total TTC pré-formaté FR/EN (ex. "12 345,00 €"). */
  newTotalTtc: string;
  /** URL publique Sellsy vers le nouveau devis. */
  newDevisUrl: string;
  /** Adresse de contact admin pour les questions. */
  senderEmail: string;
}

export interface ProspectDevisUpdatedTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderProspectDevisUpdated(
  locale: 'fr' | 'en',
  params: ProspectDevisUpdatedParams,
): ProspectDevisUpdatedTemplate {
  const normalized = { ...params, firstName: capitalizeName(params.firstName) };
  return locale === 'en' ? renderEn(normalized) : renderFr(normalized);
}

const RESPONSIVE_STYLES = `
    @media only screen and (max-width: 600px) {
      .mds-outer-padding { padding: 16px 8px !important; }
      .mds-header { padding: 20px 16px !important; }
      .mds-body { padding: 28px 20px !important; }
      .mds-headline { font-size: 20px !important; line-height: 1.3 !important; }
      .mds-text { font-size: 14px !important; }
      .mds-cta { padding: 13px 24px !important; font-size: 14px !important; }
    }
`;

// ----- FR -----

function renderFr(p: ProspectDevisUpdatedParams): ProspectDevisUpdatedTemplate {
  const subject = `[MDS 2026] Votre devis a été mis à jour — ${p.newDevisNumber}`;
  const oldRef = p.oldDevisNumber
    ? `<strong>${escapeHtml(p.oldDevisNumber)}</strong> est annulé.`
    : "L'ancien devis est annulé.";
  const oldRefText = p.oldDevisNumber
    ? `L'ancien devis ${p.oldDevisNumber} est annulé.`
    : "L'ancien devis est annulé.";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${RESPONSIVE_STYLES}</style></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333" class="mds-outer-padding">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td class="mds-header" style="background:#031A56;padding:28px 32px;color:white">
      <h1 class="mds-headline" style="margin:0;font-size:22px">Votre devis a été mis à jour</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026</p>
    </td></tr>
    <tr><td class="mds-body" style="padding:28px 32px;font-size:15px;line-height:1.55">
      <p class="mds-text" style="margin:0 0 14px">Bonjour ${escapeHtml(p.firstName)},</p>
      <p class="mds-text" style="margin:0 0 14px">Suite à un échange ou ajustement, votre devis MediaDays Solutions 2026 pour <strong>${escapeHtml(p.companyName)}</strong> a été mis à jour.</p>
      <p class="mds-text" style="margin:0 0 14px;padding:12px 14px;background:#fff7ed;border-left:3px solid #f59e0b;border-radius:4px">
        ⚠️ <strong>Important</strong> : ${oldRef}<br>
        👉 Nouveau devis : <strong>${escapeHtml(p.newDevisNumber)}</strong> — <strong>${escapeHtml(p.newTotalTtc)} TTC</strong>
      </p>
      <p style="margin:24px 0;text-align:center">
        <a href="${escapeAttr(p.newDevisUrl)}" class="mds-cta" style="display:inline-block;padding:14px 28px;background:#E6007E;color:white;text-decoration:none;border-radius:8px;font-weight:600">📥 Consulter le nouveau devis</a>
      </p>
      <p class="mds-text" style="margin:14px 0;color:#555;font-size:13px">Si vous aviez un lien de paiement précédent, il n'est plus valide. Pour payer, utilisez le nouveau devis.</p>
      <p class="mds-text" style="margin:14px 0">Pour toute question, répondez à cet email ou contactez <a href="mailto:${escapeAttr(p.senderEmail)}" style="color:#E6007E">${escapeHtml(p.senderEmail)}</a>.</p>
      <p style="margin:24px 0 0;color:#666;font-size:13px">À très bientôt,<br>L'équipe MediaDays Solutions</p>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    `Bonjour ${p.firstName},`,
    '',
    `Suite à un échange ou ajustement, votre devis MediaDays Solutions 2026 pour ${p.companyName} a été mis à jour.`,
    '',
    `⚠️ Important : ${oldRefText}`,
    `👉 Nouveau devis : ${p.newDevisNumber} — ${p.newTotalTtc} TTC`,
    `📥 Consulter / télécharger : ${p.newDevisUrl}`,
    '',
    "Si vous aviez un lien de paiement précédent, il n'est plus valide. Utilisez le nouveau devis pour payer.",
    '',
    `Pour toute question, répondez à cet email ou contactez ${p.senderEmail}.`,
    '',
    'À très bientôt,',
    "L'équipe MediaDays Solutions",
  ].join('\n');
  return { subject, html, text };
}

// ----- EN -----

function renderEn(p: ProspectDevisUpdatedParams): ProspectDevisUpdatedTemplate {
  const subject = `[MDS 2026] Your quote has been updated — ${p.newDevisNumber}`;
  const oldRef = p.oldDevisNumber
    ? `<strong>${escapeHtml(p.oldDevisNumber)}</strong> has been cancelled.`
    : 'Your previous quote has been cancelled.';
  const oldRefText = p.oldDevisNumber
    ? `Quote ${p.oldDevisNumber} has been cancelled.`
    : 'Your previous quote has been cancelled.';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${RESPONSIVE_STYLES}</style></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333" class="mds-outer-padding">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td class="mds-header" style="background:#031A56;padding:28px 32px;color:white">
      <h1 class="mds-headline" style="margin:0;font-size:22px">Your quote has been updated</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026</p>
    </td></tr>
    <tr><td class="mds-body" style="padding:28px 32px;font-size:15px;line-height:1.55">
      <p class="mds-text" style="margin:0 0 14px">Hi ${escapeHtml(p.firstName)},</p>
      <p class="mds-text" style="margin:0 0 14px">Following a discussion or adjustment, your MediaDays Solutions 2026 quote for <strong>${escapeHtml(p.companyName)}</strong> has been updated.</p>
      <p class="mds-text" style="margin:0 0 14px;padding:12px 14px;background:#fff7ed;border-left:3px solid #f59e0b;border-radius:4px">
        ⚠️ <strong>Important</strong>: ${oldRef}<br>
        👉 New quote: <strong>${escapeHtml(p.newDevisNumber)}</strong> — <strong>${escapeHtml(p.newTotalTtc)} incl. VAT</strong>
      </p>
      <p style="margin:24px 0;text-align:center">
        <a href="${escapeAttr(p.newDevisUrl)}" class="mds-cta" style="display:inline-block;padding:14px 28px;background:#E6007E;color:white;text-decoration:none;border-radius:8px;font-weight:600">📥 Open the new quote</a>
      </p>
      <p class="mds-text" style="margin:14px 0;color:#555;font-size:13px">Any previous payment link is no longer valid. Please use the new quote to pay.</p>
      <p class="mds-text" style="margin:14px 0">For any question, reply to this email or contact <a href="mailto:${escapeAttr(p.senderEmail)}" style="color:#E6007E">${escapeHtml(p.senderEmail)}</a>.</p>
      <p style="margin:24px 0 0;color:#666;font-size:13px">See you soon,<br>The MediaDays Solutions team</p>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    `Hi ${p.firstName},`,
    '',
    `Following a discussion or adjustment, your MediaDays Solutions 2026 quote for ${p.companyName} has been updated.`,
    '',
    `⚠️ Important: ${oldRefText}`,
    `👉 New quote: ${p.newDevisNumber} — ${p.newTotalTtc} incl. VAT`,
    `📥 Open / download: ${p.newDevisUrl}`,
    '',
    'Any previous payment link is no longer valid. Please use the new quote to pay.',
    '',
    `For any question, reply to this email or contact ${p.senderEmail}.`,
    '',
    'See you soon,',
    'The MediaDays Solutions team',
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
