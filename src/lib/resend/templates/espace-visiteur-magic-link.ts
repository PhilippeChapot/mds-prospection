/**
 * Template magic-link Espace Visiteur — P15.3.
 * Cloné de espace-partenaire-magic-link.ts (audience visiteur).
 */

import { capitalizeName } from '@/lib/format/name';

export interface EspaceVisiteurMagicLinkParams {
  firstName: string;
  magicLinkUrl: string;
  requestPageUrl: string;
}

export interface EspaceVisiteurMagicLinkTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderEspaceVisiteurMagicLinkTemplate(
  locale: 'fr' | 'en',
  params: EspaceVisiteurMagicLinkParams,
): EspaceVisiteurMagicLinkTemplate {
  const normalized = { ...params, firstName: capitalizeName(params.firstName) };
  return locale === 'fr' ? renderFr(normalized) : renderEn(normalized);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function renderFr(p: EspaceVisiteurMagicLinkParams): EspaceVisiteurMagicLinkTemplate {
  const subject = `Votre lien d'accès Espace Visiteur MediaDays Solutions 2026`;
  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Cliquez sur le bouton ci-dessous pour accéder à votre Espace Visiteur MediaDays Solutions 2026 :
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.magicLinkUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Accéder à mon Espace Visiteur</a>
        </p>
        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ Ce lien est valable <strong>15 minutes</strong>. Sinon, demandez un nouveau lien sur <a href="${escapeAttr(p.requestPageUrl)}" style="color: #294294;">${escapeHtml(p.requestPageUrl)}</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Si vous n'avez pas demandé ce lien, ignorez ce message.
        </p>
        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          À très vite,<br />L'équipe MediaDays Solutions
        </p>
      </div>
    </div>
  `.trim();
  const text = [
    `Bonjour ${p.firstName},`,
    ``,
    `Cliquez sur le lien ci-dessous pour acceder a votre Espace Visiteur MediaDays Solutions 2026 :`,
    ``,
    p.magicLinkUrl,
    ``,
    `Ce lien est valable 15 minutes. Au-dela, redemandez un lien sur ${p.requestPageUrl}.`,
    ``,
    `Si vous n'avez pas demande ce lien, ignorez ce message.`,
    ``,
    `L'equipe MediaDays Solutions`,
  ].join('\n');
  return { subject, html, text };
}

function renderEn(p: EspaceVisiteurMagicLinkParams): EspaceVisiteurMagicLinkTemplate {
  const subject = `Your MediaDays Solutions 2026 Visitor Portal access link`;
  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Click the button below to access your MediaDays Solutions 2026 Visitor Portal:
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.magicLinkUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Access my Visitor Portal</a>
        </p>
        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ This link is valid for <strong>15 minutes</strong>. Otherwise, request a new link at <a href="${escapeAttr(p.requestPageUrl)}" style="color: #294294;">${escapeHtml(p.requestPageUrl)}</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          If you didn't request this link, please ignore this message.
        </p>
        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Looking forward,<br />The MediaDays Solutions team
        </p>
      </div>
    </div>
  `.trim();
  const text = [
    `Hi ${p.firstName},`,
    ``,
    `Click the link below to access your MediaDays Solutions 2026 Visitor Portal:`,
    ``,
    p.magicLinkUrl,
    ``,
    `This link is valid for 15 minutes. After that, request a new link at ${p.requestPageUrl}.`,
    ``,
    `If you didn't request this link, please ignore this message.`,
    ``,
    `The MediaDays Solutions team`,
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
