/**
 * P9.2 — template email "nouveau message dans une conversation interne".
 *
 * Envoye a chaque participant (sauf l'expediteur) a chaque insert
 * d'`internal_messages`. Reply-to philippe@mediadays.solutions (pour les
 * contacts qui repondraient par email plutot que via /mon-espace ; V2
 * gerera l'inbound parsing).
 */

export interface InternalMessageEmailParams {
  recipientName: string;
  senderName: string;
  conversationSubject: string | null;
  /** Preview du message (200 premiers chars, plain text). */
  messagePreview: string;
  /** Lien direct vers la fiche conversation (admin OU /mon-espace). */
  conversationUrl: string;
  locale: 'fr' | 'en';
}

export interface InternalMessageEmailTemplate {
  subject: string;
  html: string;
  text: string;
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
    subject: (sender: string) => `Nouveau message de ${sender} — MediaDays Solutions`,
    hello: (n: string) => `Bonjour ${n},`,
    intro: (sender: string) => `${sender} vient de vous laisser un nouveau message :`,
    cta: 'Voir et répondre →',
    sigPre: 'MediaDays Solutions',
    sigPost:
      "Connectez-vous à votre espace pour répondre. Toute réponse par email arrivera dans la boîte de l'équipe.",
  },
  en: {
    subject: (sender: string) => `New message from ${sender} — MediaDays Solutions`,
    hello: (n: string) => `Hello ${n},`,
    intro: (sender: string) => `${sender} just left you a new message:`,
    cta: 'View and reply →',
    sigPre: 'MediaDays Solutions',
    sigPost: 'Sign in to your space to reply. Any answer by email will reach the team.',
  },
} as const;

export function renderInternalMessageNotification(
  params: InternalMessageEmailParams,
): InternalMessageEmailTemplate {
  const copy = COPY[params.locale];
  const subject = copy.subject(params.senderName);
  const subjectLine = params.conversationSubject
    ? `<p style="margin:0 0 8px;font-size:12px;color:#888"><strong>${escapeHtml('Sujet :')}</strong> ${escapeHtml(params.conversationSubject)}</p>`
    : '';

  const html = `<!DOCTYPE html><html lang="${params.locale}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:20px 28px;color:white">
      <h1 style="margin:0;font-size:18px">${escapeHtml(copy.sigPre)}</h1>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#222">
      <p style="margin:0 0 14px">${escapeHtml(copy.hello(params.recipientName))}</p>
      <p style="margin:0 0 14px">${escapeHtml(copy.intro(params.senderName))}</p>
      ${subjectLine}
      <div style="background:#f6f7fb;border-left:3px solid #E91E63;border-radius:6px;padding:14px 16px;white-space:pre-wrap;font-size:14px;color:#222;margin:0 0 18px">${escapeHtml(params.messagePreview)}</div>
      <p style="margin:22px 0 0;text-align:center">
        <a href="${escapeHtml(params.conversationUrl)}" style="display:inline-block;background:#E91E63;color:white;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:600;font-size:14px">${escapeHtml(copy.cta)}</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#666">${escapeHtml(copy.sigPost)}</p>
    </td></tr>
    <tr><td style="padding:14px 28px;font-size:11px;color:#888;border-top:1px solid #eee;text-align:center">
      MediaDays Solutions 2026 — Éditions HF
    </td></tr>
  </table>
</body></html>`;

  const text = [
    copy.hello(params.recipientName),
    '',
    copy.intro(params.senderName),
    ...(params.conversationSubject ? [`Sujet : ${params.conversationSubject}`] : []),
    '',
    params.messagePreview,
    '',
    `${copy.cta} ${params.conversationUrl}`,
    '',
    copy.sigPost,
  ].join('\n');

  return { subject, html, text };
}
