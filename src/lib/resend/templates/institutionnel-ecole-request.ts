/**
 * P6.x.4-a — templates email pour demandes de tarif Institutionnel/École.
 *
 * - renderAdminInstitutionnelEcoleRequest : notification admin (Phil)
 * - renderClientInstitutionnelEcoleConfirmation : accusé de réception
 *   envoyé au demandeur (rassure : "on revient sous 48h").
 *
 * FR uniquement v1 (la landing est i18n FR/EN mais les contenus de cette
 * milestone restent FR ; EN fallback FR — cf. P6.x.4-a brief).
 */

export type RequestType = 'institutionnel' | 'ecole';

export interface AdminRequestParams {
  type: RequestType;
  orgName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
  message: string | null;
  requestId: string;
  adminUrl: string;
  createdAt: string;
}

export interface RequestEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const TYPE_LABEL: Record<RequestType, string> = {
  institutionnel: 'Institutionnel',
  ecole: 'École',
};

export function renderAdminInstitutionnelEcoleRequest(
  params: AdminRequestParams,
): RequestEmailTemplate {
  const label = TYPE_LABEL[params.type];
  // P6.x.4-a-bis : subject pointe sur le prospect dans le pipeline
  const subject = `Nouveau prospect Landing — ${params.orgName} (${label})`;
  const fields: Array<[string, string]> = [
    ['Type', label],
    ['Organisation', params.orgName],
    ['Contact', params.contactName],
    ['Email', params.contactEmail],
  ];
  if (params.contactPhone) fields.push(['Téléphone', params.contactPhone]);
  if (params.website) fields.push(['Site web', params.website]);
  if (params.message) fields.push(['Message', params.message]);

  const rows = fields
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;color:#031A56;width:140px;border-bottom:1px solid #eee">${escapeHtml(k)}</td><td style="padding:8px 12px;color:#333;border-bottom:1px solid #eee">${escapeHtml(v)}</td></tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:24px 28px;color:white">
      <h1 style="margin:0;font-size:20px">Nouveau prospect Landing — ${escapeHtml(label)}</h1>
      <p style="margin:6px 0 0;color:#bcc4dd;font-size:14px">${escapeHtml(params.orgName)} · ${escapeHtml(params.createdAt)}</p>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <p style="margin:0 0 16px;font-size:14px;color:#444">
        Une demande de tarif ${escapeHtml(label)} a été captée depuis la landing publique
        et un prospect a été créé dans le pipeline (status <strong>lead</strong>, source
        <code style="background:#f6f7fb;padding:2px 6px;border-radius:4px">landing_form</code>).
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px">
        ${rows}
      </table>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${escapeAttr(params.adminUrl)}" style="display:inline-block;padding:12px 22px;background:#E6007E;color:white;text-decoration:none;border-radius:8px;font-weight:600">Voir la fiche prospect →</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

  const textLines = [
    subject,
    '',
    `Prospect créé (status: lead, source: landing_form, source_detail: ${params.type}).`,
    '',
    ...fields.map(([k, v]) => `${k}: ${v}`),
    '',
    `Voir la fiche prospect : ${params.adminUrl}`,
  ];

  return { subject, html, text: textLines.join('\n') };
}

export interface ClientConfirmationParams {
  type: RequestType;
  contactName: string;
  orgName: string;
}

export function renderClientInstitutionnelEcoleConfirmation(
  params: ClientConfirmationParams,
): RequestEmailTemplate {
  const label = TYPE_LABEL[params.type];
  const subject = `Demande de tarif ${label} reçue — MediaDays Solutions 2026`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#031A56;padding:28px;color:white;text-align:center">
      <h1 style="margin:0;font-size:22px">Merci ${escapeHtml(params.contactName)} 👋</h1>
      <p style="margin:8px 0 0;color:#bcc4dd;font-size:14px">MediaDays Solutions 2026</p>
    </td></tr>
    <tr><td style="padding:28px 32px;font-size:15px;line-height:1.55">
      <p style="margin:0 0 14px">Nous avons bien reçu la demande de tarif <strong>${escapeHtml(label)}</strong> pour <strong>${escapeHtml(params.orgName)}</strong>.</p>
      <p style="margin:0 0 14px">Notre équipe revient vers vous sous 48h avec une proposition adaptée à votre organisation.</p>
      <p style="margin:0 0 14px">En attendant, rendez-vous sur <a href="https://mediadays.solutions" style="color:#E6007E;font-weight:600">mediadays.solutions</a> pour explorer les 6 pôles du salon et les 245 entités visiteurs déjà identifiées.</p>
      <p style="margin:28px 0 0;color:#666;font-size:13px">— L'équipe MediaDays Solutions</p>
    </td></tr>
  </table>
</body></html>`;
  const text =
    `Merci ${params.contactName} —\n\n` +
    `Nous avons bien reçu votre demande de tarif ${label} pour ${params.orgName}.\n` +
    `Notre équipe revient vers vous sous 48h.\n\n` +
    `— L'équipe MediaDays Solutions\nhttps://mediadays.solutions\n`;
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
