/**
 * P9.1-natif — templates email pour la messagerie visiteur native.
 *
 * - renderAdminVisitorMessageNotification : notification staff "nouveau
 *   message visiteur" (alerte rapide avec lien direct vers l'inbox).
 * - renderVisitorReplyEmail : email envoye au visiteur quand un staff
 *   repond depuis /admin/messages. Body = la reponse + citation du
 *   message original (rappel du contexte si on reponse a J+3).
 *
 * Bilingue FR/EN selon `locale`. Branding MDS minimal (logo + couleurs)
 * pour rester sobre dans une boite mail visiteur.
 */

export interface VisitorEmailTemplate {
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

// ---------------------------------------------------------------------------
// Admin notification : "Nouveau message visiteur"
// ---------------------------------------------------------------------------

export interface AdminVisitorMessageParams {
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  message: string;
  pageUrl: string | null;
  inboxUrl: string;
  createdAt: string;
}

export function renderAdminVisitorMessageNotification(
  params: AdminVisitorMessageParams,
): VisitorEmailTemplate {
  const subject = `[MDS] Nouveau message visiteur : ${params.visitorName}`;
  const fields: Array<[string, string]> = [
    ['Nom', params.visitorName],
    ['Email', params.visitorEmail],
  ];
  if (params.visitorPhone) fields.push(['Téléphone', params.visitorPhone]);
  if (params.pageUrl) fields.push(['Page', params.pageUrl]);
  fields.push(['Reçu le', params.createdAt]);

  const rows = fields
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;color:#031A56;width:120px;border-bottom:1px solid #eee">${escapeHtml(k)}</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #eee">${escapeHtml(v)}</td></tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px">💬 Nouveau message visiteur</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">${escapeHtml(params.visitorName)} · ${escapeHtml(params.createdAt)}</p>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
        ${rows}
      </table>
      <h2 style="margin:24px 0 8px;font-size:15px;color:#031A56">Message</h2>
      <div style="background:#f6f7fb;border-radius:8px;padding:14px 16px;white-space:pre-wrap;font-size:14px;color:#222">${escapeHtml(params.message)}</div>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${escapeHtml(params.inboxUrl)}" style="display:inline-block;background:#E91E63;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">Répondre depuis l'inbox →</a>
      </p>
    </td></tr>
    <tr><td style="padding:14px 28px;font-size:11px;color:#888;border-top:1px solid #eee;text-align:center">
      MediaDays Solutions — Éditions HF · message capté via le widget public.
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Nouveau message visiteur sur mediadays.solutions.`,
    '',
    ...fields.map(([k, v]) => `${k} : ${v}`),
    '',
    'Message :',
    params.message,
    '',
    `Répondre dans l'inbox : ${params.inboxUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Reply visiteur : "Re: Votre message a MediaDays Solutions"
// ---------------------------------------------------------------------------

export interface VisitorReplyParams {
  visitorName: string;
  replyText: string;
  originalMessage: string;
  locale: 'fr' | 'en';
  senderDisplayName?: string;
}

const REPLY_COPY = {
  fr: {
    subject: 'Re: Votre message à MediaDays Solutions',
    hello: (n: string) => `Bonjour ${n},`,
    intro: 'Merci pour votre message ! Voici notre réponse :',
    quoteHeader: 'Votre message initial :',
    sigPre: "L'équipe MediaDays Solutions",
    sigPost:
      "Si vous souhaitez répondre, il vous suffit d'utiliser le bouton « Répondre » de votre messagerie — votre message reviendra directement chez nous.",
  },
  en: {
    subject: 'Re: Your message to MediaDays Solutions',
    hello: (n: string) => `Hello ${n},`,
    intro: 'Thanks for reaching out! Here is our reply:',
    quoteHeader: 'Your original message:',
    sigPre: 'The MediaDays Solutions team',
    sigPost: 'Feel free to reply to this email — your answer will reach us directly.',
  },
} as const;

export function renderVisitorReplyEmail(params: VisitorReplyParams): VisitorEmailTemplate {
  const copy = REPLY_COPY[params.locale];
  const sender = params.senderDisplayName ?? copy.sigPre;

  const html = `<!DOCTYPE html><html lang="${params.locale}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:20px 28px;color:white">
      <h1 style="margin:0;font-size:18px">MediaDays Solutions</h1>
    </td></tr>
    <tr><td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#222">
      <p style="margin:0 0 14px">${escapeHtml(copy.hello(params.visitorName))}</p>
      <p style="margin:0 0 14px">${escapeHtml(copy.intro)}</p>
      <div style="background:#f6f7fb;border-left:3px solid #E91E63;border-radius:6px;padding:14px 16px;white-space:pre-wrap;font-size:14px;color:#222;margin:0 0 18px">${escapeHtml(params.replyText)}</div>
      <p style="margin:24px 0 6px;font-weight:600;color:#031A56">— ${escapeHtml(sender)}</p>
      <p style="margin:0 0 24px;font-size:12px;color:#666">${escapeHtml(copy.sigPost)}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px"/>
      <p style="margin:0 0 6px;font-size:12px;color:#888">${escapeHtml(copy.quoteHeader)}</p>
      <blockquote style="margin:0;padding:10px 14px;border-left:3px solid #ccc;background:#fafafa;font-size:13px;color:#555;white-space:pre-wrap">${escapeHtml(params.originalMessage)}</blockquote>
    </td></tr>
    <tr><td style="padding:14px 28px;font-size:11px;color:#888;border-top:1px solid #eee;text-align:center">
      MediaDays Solutions 2026 — Éditions HF
    </td></tr>
  </table>
</body></html>`;

  const text = [
    copy.hello(params.visitorName),
    '',
    copy.intro,
    '',
    params.replyText,
    '',
    `— ${sender}`,
    '',
    copy.sigPost,
    '',
    '----',
    copy.quoteHeader,
    params.originalMessage,
  ].join('\n');

  return { subject: copy.subject, html, text };
}
