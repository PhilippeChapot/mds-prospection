/**
 * @vitest-environment node
 *
 * P12.x.EmailIntegration — resolveAccountConfig (credentials env).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveAccountConfig } from './account-config';
import { applyTemplateVars } from './template-vars';
import type { EmailAccountRow } from './types';

const account: EmailAccountRow = {
  id: 'a1',
  user_id: 'u1',
  email: 'phil@mediadays.solutions',
  display_name: 'Phil',
  env_var_key: 'IONOS_PHIL',
  imap_host: 'imap.ionos.fr',
  imap_port: 993,
  smtp_host: 'smtp.ionos.fr',
  smtp_port: 465,
  is_active: true,
  last_uid: null,
  last_synced_at: null,
  last_error: null,
};

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAccountConfig (P12.x)', () => {
  it('env présentes → config résolue', () => {
    vi.stubEnv('IONOS_PHIL_IMAP_PASSWORD', 'imap-pw');
    vi.stubEnv('IONOS_PHIL_SMTP_PASSWORD', 'smtp-pw');
    const r = resolveAccountConfig(account);
    expect(r).not.toBeNull();
    expect(r?.imapPassword).toBe('imap-pw');
    expect(r?.smtpPassword).toBe('smtp-pw');
  });

  it('IMAP password manquant → null', () => {
    vi.stubEnv('IONOS_PHIL_IMAP_PASSWORD', '');
    vi.stubEnv('IONOS_PHIL_SMTP_PASSWORD', 'smtp-pw');
    expect(resolveAccountConfig(account)).toBeNull();
  });

  it('SMTP password manquant → null', () => {
    vi.stubEnv('IONOS_PHIL_IMAP_PASSWORD', 'imap-pw');
    expect(resolveAccountConfig(account)).toBeNull();
  });
});

describe('applyTemplateVars (P12.x)', () => {
  it('remplace les variables connues', () => {
    const out = applyTemplateVars(
      'Bonjour {contact.first_name} de {company.name} ({prospect.amount})',
      {
        'contact.first_name': 'Jean',
        'company.name': 'Acme',
        'prospect.amount': '7 630 €',
      },
    );
    expect(out).toBe('Bonjour Jean de Acme (7 630 €)');
  });

  it('laisse les tokens inconnus intacts', () => {
    expect(applyTemplateVars('Hello {unknown.token}', {})).toBe('Hello {unknown.token}');
  });
});
