/**
 * Template magic-link Espace Partenaire — P5.x.2.
 *
 * Email transactionnel envoye apres POST /api/espace-partenaire/request-magic-link
 * pour permettre a l'partenaire d'acceder a son dashboard sans password.
 *
 * Charte simple : reuse des styles BASE_STYLES de prospect-acompte-paymentlink
 * (fond gris pale + carte blanche) pour rester coherent avec les autres
 * templates Resend MDS.
 *
 * TTL du magic-link : 15 minutes (cf. signMagicToken). Si l'utilisateur
 * n'a pas clique dans ce delai, il doit redemander un lien.
 */

export interface EspacePartenaireMagicLinkParams {
  firstName: string;
  /** URL absolue de la forme `${SITE_URL}/{locale}/espace-partenaire/login?token=...`. */
  magicLinkUrl: string;
  /** URL de la page demande (utile pour le hint "redemander un lien"). */
  requestPageUrl: string;
}

export interface EspacePartenaireMagicLinkTemplate {
  subject: string;
  html: string;
  text: string;
}

import { capitalizeName } from '@/lib/format/name';

export function renderEspacePartenaireMagicLinkTemplate(
  locale: 'fr' | 'en',
  params: EspacePartenaireMagicLinkParams,
): EspacePartenaireMagicLinkTemplate {
  // P5.x.5 : normalise le prenom a l'affichage. Doctrine MDS = stockage
  // brut en DB, capitalize cote rendu uniquement (un user qui tape "phil"
  // doit voir "Phil" dans son email). Idempotent : un appel sur "Phil"
  // re-rend "Phil".
  const normalized = { ...params, firstName: capitalizeName(params.firstName) };
  return locale === 'fr' ? renderFr(normalized) : renderEn(normalized);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function renderFr(p: EspacePartenaireMagicLinkParams): EspacePartenaireMagicLinkTemplate {
  const subject = `Votre lien d'accès Espace Partenaire MediaDays Solutions 2026`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Cliquez sur le bouton ci-dessous pour accéder à votre Espace Partenaire MediaDays Solutions 2026 :
        </p>

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.magicLinkUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Accéder à mon Espace Partenaire</a>
        </p>

        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ Ce lien est valable <strong>15 minutes</strong>. Si vous ne l'utilisez pas dans ce délai, demandez un nouveau lien sur <a href="${escapeAttr(p.requestPageUrl)}" style="color: #294294;">${escapeHtml(p.requestPageUrl)}</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Si vous n'avez pas demandé ce lien, ignorez ce message — votre compte reste sécurisé.
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          À très vite,<br />
          L'équipe MediaDays Solutions
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Bonjour ${p.firstName},`,
    ``,
    `Cliquez sur le lien ci-dessous pour acceder a votre Espace Partenaire MediaDays Solutions 2026 :`,
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

function renderEn(p: EspacePartenaireMagicLinkParams): EspacePartenaireMagicLinkTemplate {
  const subject = `Your MediaDays Solutions 2026 Partner Portal access link`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(p.firstName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Click the button below to access your MediaDays Solutions 2026 Partner Portal:
        </p>

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.magicLinkUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Access my Partner Portal</a>
        </p>

        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ This link is valid for <strong>15 minutes</strong>. If you don't use it within this time, request a new link at <a href="${escapeAttr(p.requestPageUrl)}" style="color: #294294;">${escapeHtml(p.requestPageUrl)}</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          If you didn't request this link, please ignore this message — your account remains secure.
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Looking forward,<br />
          The MediaDays Solutions team
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Hi ${p.firstName},`,
    ``,
    `Click the link below to access your MediaDays Solutions 2026 Partner Portal:`,
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
