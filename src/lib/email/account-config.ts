/**
 * P12.x.EmailIntegration — résolution des credentials d'un compte email.
 *
 * Sécurité : les mots de passe ne sont JAMAIS en base. On lit
 * `${env_var_key}_IMAP_PASSWORD` / `${env_var_key}_SMTP_PASSWORD` dans les
 * variables d'environnement (Vercel). Pas de 'use server' (utilitaire pur).
 */

import type { EmailAccountRow, ResolvedAccountConfig } from './types';

export function resolveAccountConfig(account: EmailAccountRow): ResolvedAccountConfig | null {
  const imapPassword = process.env[`${account.env_var_key}_IMAP_PASSWORD`];
  const smtpPassword = process.env[`${account.env_var_key}_SMTP_PASSWORD`];
  if (!imapPassword || !smtpPassword) return null;
  return { account, imapPassword, smtpPassword };
}
