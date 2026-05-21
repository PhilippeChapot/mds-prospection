/**
 * Template magic-link Espace Affilie — P7.x.1.A
 *
 * Mirror du template `espace-exposant-magic-link.ts` adapte pour l'espace
 * affilie. FR uniquement en foundation (V1 monolingue) -- EN ajoute dans
 * une milestone ulterieure si besoin.
 *
 * TTL : 15 minutes (cf. signAffilieMagicToken).
 */

import { capitalizeName } from '@/lib/format/name';

export interface AffilieMagicLinkParams {
  /** Display name de l'affilie (peut etre un prenom ou un nom de societe). */
  displayName: string;
  magicLinkUrl: string;
  /** URL de la page de demande (lien "redemander" en footer). */
  requestPageUrl: string;
}

export interface AffilieMagicLinkTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderAffilieMagicLinkTemplate(
  params: AffilieMagicLinkParams,
): AffilieMagicLinkTemplate {
  const normalized = { ...params, displayName: capitalizeName(params.displayName) };
  return renderFr(normalized);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function renderFr(p: AffilieMagicLinkParams): AffilieMagicLinkTemplate {
  const subject = `Votre lien d'accès Espace Affilié MediaDays Solutions 2026`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.displayName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Cliquez sur le bouton ci-dessous pour accéder à votre Espace Affilié MediaDays Solutions 2026 :
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${escapeAttr(p.magicLinkUrl)}" style="display: inline-block; padding: 14px 28px; background: #E6007E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;">
            Accéder à mon espace affilié →
          </a>
        </p>
        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b80; line-height: 1.55;">
          Ce lien est valable <strong>15 minutes</strong>. Au-delà, vous pouvez en demander un nouveau depuis
          <a href="${escapeAttr(p.requestPageUrl)}" style="color: #E6007E;">cette page</a>.
        </p>
        <p style="margin: 24px 0 0; font-size: 12px; color: #8593a8;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucune action ne sera effectuée.
        </p>
      </div>
      <p style="text-align: center; margin: 16px 0 0; font-size: 11px; color: #8593a8;">
        MediaDays Solutions 2026 · Programme Affiliés
      </p>
    </div>
  `;

  const text = `Bonjour ${p.displayName},

Cliquez sur le lien ci-dessous pour acceder a votre Espace Affilie MediaDays Solutions 2026 :

${p.magicLinkUrl}

Ce lien est valable 15 minutes. Au-dela, demandez un nouveau lien sur ${p.requestPageUrl}.

Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email.

MediaDays Solutions 2026 · Programme Affilies`;

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
