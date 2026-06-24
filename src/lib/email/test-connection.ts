/**
 * P12.x.EmailIntegration — test live IMAP + SMTP d'un compte. Node runtime.
 */

import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { ResolvedAccountConfig } from './types';

export interface ConnectionTestResult {
  imap: { ok: boolean; error?: string };
  smtp: { ok: boolean; error?: string };
}

export async function testEmailAccountConnection(
  config: ResolvedAccountConfig,
): Promise<ConnectionTestResult> {
  const { account, imapPassword, smtpPassword } = config;
  const result: ConnectionTestResult = { imap: { ok: false }, smtp: { ok: false } };

  // IMAP
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.email, pass: imapPassword },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    result.imap.ok = true;
  } catch (err) {
    result.imap.error = err instanceof Error ? err.message : String(err);
    try {
      await client.close();
    } catch {
      /* noop */
    }
  }

  // SMTP
  try {
    const transport = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: true,
      auth: { user: account.email, pass: smtpPassword },
    });
    await transport.verify();
    result.smtp.ok = true;
  } catch (err) {
    result.smtp.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}
