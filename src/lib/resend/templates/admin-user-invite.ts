/**
 * Template invitation admin/sales/super_admin — P5.x.1-bis.
 *
 * Envoyé via Resend (pas Brevo : le tracker Brevo wrappe les liens et 404
 * cf. memoire `project_brevo_tracker_bug.md` + commentaire en tête de
 * lib/brevo/client.ts).
 *
 * Branding cohérent avec espace-partenaire-magic-link.ts (charte BASE_STYLES
 * grise + carte blanche + CTA magenta).
 *
 * TTL Supabase Auth invite link : 24h (par défaut). Au-delà l'admin
 * super_admin doit cliquer "Renvoyer invite" dans /admin/users.
 */

import { capitalizeName } from '@/lib/format/name';

export type AdminInviteRole = 'admin' | 'sales' | 'super_admin';

export interface AdminUserInviteParams {
  fullName: string;
  role: AdminInviteRole;
  /** URL absolue du action_link Supabase Auth (action=invite). */
  inviteUrl: string;
  /** URL du dashboard admin une fois connecté. */
  adminHomeUrl: string;
}

export interface AdminUserInviteTemplate {
  subject: string;
  html: string;
  text: string;
}

const ROLE_LABEL: Record<'fr' | 'en', Record<AdminInviteRole, string>> = {
  fr: { admin: 'Administrateur', sales: 'Commercial', super_admin: 'Super-administrateur' },
  en: { admin: 'Administrator', sales: 'Sales', super_admin: 'Super-administrator' },
};

export function renderAdminUserInviteTemplate(
  locale: 'fr' | 'en',
  params: AdminUserInviteParams,
): AdminUserInviteTemplate {
  const normalized = { ...params, fullName: capitalizeName(params.fullName) };
  return locale === 'fr' ? renderFr(normalized) : renderEn(normalized);
}

const BASE_STYLES = `
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f4f6fb;
  color: #0a1628;
  padding: 28px;
`;

function renderFr(p: AdminUserInviteParams): AdminUserInviteTemplate {
  const roleLabel = ROLE_LABEL.fr[p.role];
  const subject = `Vous êtes invité sur MediaDays Solutions Prospection`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;">
          MediaDays Solutions Prospection
        </p>
        <p style="margin: 0 0 16px;">Bonjour ${escapeHtml(p.fullName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          Vous venez d'être invité à rejoindre l'équipe <strong>MediaDays Solutions Prospection</strong>
          en tant que <strong>${escapeHtml(roleLabel)}</strong>.
        </p>

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.inviteUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Activer mon compte</a>
        </p>

        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ Ce lien d'activation est valable <strong>24 heures</strong>. Au-delà, demandez à votre
          super-administrateur de vous renvoyer une invitation depuis
          <a href="${escapeAttr(p.adminHomeUrl)}/users" style="color: #294294;">/admin/users</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Une fois connecté, vous accéderez aux outils de pilotage des MediaDays
          Solutions 2026 (prospects, sociétés, devis, statistiques…).
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          À très vite,<br />
          L'équipe MediaDays Solutions
        </p>

        <hr style="border: none; border-top: 1px solid #e0e4ee; margin: 24px 0;" />
        <p style="margin: 0; font-size: 11px; color: #8a96ad; line-height: 1.5;">
          Editions HF — Podcast &amp; RadioHouse<br />
          8 rue Fernand Delmas — 19100 Brive-la-Gaillarde, France<br />
          Si vous n'attendiez pas cette invitation, ignorez ce message — aucun compte
          ne sera créé tant que vous n'aurez pas cliqué.
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Bonjour ${p.fullName},`,
    ``,
    `Vous etes invite a rejoindre MediaDays Solutions Prospection en tant que ${roleLabel}.`,
    ``,
    `Cliquez sur le lien suivant pour activer votre compte (valable 24h) :`,
    p.inviteUrl,
    ``,
    `Une fois connecte vous accederez au dashboard admin :`,
    p.adminHomeUrl,
    ``,
    `Si vous n'attendiez pas cette invitation, ignorez ce message.`,
    ``,
    `L'equipe MediaDays Solutions`,
    `Editions HF`,
  ].join('\n');

  return { subject, html, text };
}

function renderEn(p: AdminUserInviteParams): AdminUserInviteTemplate {
  const roleLabel = ROLE_LABEL.en[p.role];
  const subject = `You're invited to MediaDays Solutions Prospection`;

  const html = `
    <div style="${BASE_STYLES}">
      <div style="max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e0e4ee; border-radius: 12px; padding: 32px;">
        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700;">
          MediaDays Solutions Prospection
        </p>
        <p style="margin: 0 0 16px;">Hi ${escapeHtml(p.fullName)},</p>
        <p style="margin: 0 0 24px; line-height: 1.55;">
          You've been invited to join the <strong>MediaDays Solutions Prospection</strong> team
          as <strong>${escapeHtml(roleLabel)}</strong>.
        </p>

        <p style="margin: 0 0 24px;">
          <a href="${escapeAttr(p.inviteUrl)}" style="display: inline-block; padding: 14px 28px; background: #e6007e; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Activate my account</a>
        </p>

        <p style="margin: 0 0 16px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          ⏱️ This activation link is valid for <strong>24 hours</strong>. After that, ask your
          super-administrator to resend an invitation from
          <a href="${escapeAttr(p.adminHomeUrl)}/users" style="color: #294294;">/admin/users</a>.
        </p>
        <p style="margin: 0 0 24px; font-size: 13px; color: #5c6b85; line-height: 1.5;">
          Once signed in, you'll access MediaDays Solutions 2026 management tools
          (prospects, companies, quotes, analytics…).
        </p>

        <p style="margin: 24px 0 0; font-size: 13px; color: #5c6b85;">
          Looking forward,<br />
          The MediaDays Solutions team
        </p>

        <hr style="border: none; border-top: 1px solid #e0e4ee; margin: 24px 0;" />
        <p style="margin: 0; font-size: 11px; color: #8a96ad; line-height: 1.5;">
          Editions HF — Podcast &amp; RadioHouse<br />
          8 rue Fernand Delmas — 19100 Brive-la-Gaillarde, France<br />
          If you weren't expecting this invitation, please ignore this message — no account
          will be created until you click the activation link.
        </p>
      </div>
    </div>
  `.trim();

  const text = [
    `Hi ${p.fullName},`,
    ``,
    `You've been invited to join MediaDays Solutions Prospection as ${roleLabel}.`,
    ``,
    `Click the link below to activate your account (valid for 24h):`,
    p.inviteUrl,
    ``,
    `Once activated, you can access the admin dashboard:`,
    p.adminHomeUrl,
    ``,
    `If you weren't expecting this invitation, please ignore this message.`,
    ``,
    `The MediaDays Solutions team`,
    `Editions HF`,
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
