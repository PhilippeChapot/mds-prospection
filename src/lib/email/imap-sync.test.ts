/**
 * @vitest-environment node
 *
 * P12.x fix — syncEmailAccount INSERT inbound (régression silent failure).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

interface DbState {
  account: Record<string, unknown> | null;
  inserted: Array<Record<string, unknown>>;
  insertError: { code?: string; message: string } | null;
  accountUpdate: Record<string, unknown> | null;
}
const dbState: DbState = { account: null, inserted: [], insertError: null, accountUpdate: null };

function mockDb(): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'email_accounts') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: dbState.account }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => {
              dbState.accountUpdate = patch;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'emails') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              maybeSingle: () => {
                if (dbState.insertError)
                  return Promise.resolve({ data: null, error: dbState.insertError });
                dbState.inserted.push(row);
                return Promise.resolve({
                  data: { id: `em-${dbState.inserted.length}` },
                  error: null,
                });
              },
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
}

function mockModules() {
  vi.doMock('imapflow', () => ({
    ImapFlow: class {
      connect() {
        return Promise.resolve();
      }
      getMailboxLock() {
        return Promise.resolve({ release: () => undefined });
      }
      async *fetch() {
        yield { uid: 130, source: Buffer.from('raw'), flags: new Set<string>() };
      }
      logout() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    },
  }));
  vi.doMock('mailparser', () => ({
    simpleParser: () =>
      Promise.resolve({
        subject: 'Bonjour',
        from: { value: [{ address: 'client@acme.fr', name: 'Client' }] },
        to: { value: [{ address: 'phil@mediadays.solutions' }] },
        cc: undefined,
        references: undefined,
        text: 'corps',
        html: '<p>corps</p>',
        date: new Date('2026-06-24T10:00:00Z'),
        messageId: '<mid-1>',
        inReplyTo: undefined,
        attachments: [],
      }),
  }));
  vi.doMock('./account-config', () => ({
    resolveAccountConfig: () => ({
      account: dbState.account,
      imapPassword: 'p',
      smtpPassword: 'p',
    }),
  }));
  vi.doMock('./auto-link', () => ({ autoLinkEmail: () => Promise.resolve(0) }));
}

beforeEach(() => {
  dbState.account = {
    id: 'a1',
    email: 'phil@mediadays.solutions',
    env_var_key: 'IONOS_PHIL',
    imap_host: 'imap.ionos.fr',
    imap_port: 993,
    smtp_host: 'smtp.ionos.fr',
    smtp_port: 465,
    last_uid: 0,
  };
  dbState.inserted = [];
  dbState.insertError = null;
  dbState.accountUpdate = null;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('syncEmailAccount (P12.x fix silent failure)', () => {
  it('fetched=1 → inserted=1 avec direction=inbound, pas de last_error', async () => {
    mockModules();
    const { syncEmailAccount } = await import('./imap-sync');
    const r = await syncEmailAccount(mockDb(), 'a1');
    expect(r.fetched).toBe(1);
    expect(r.inserted).toBe(1);
    expect(dbState.inserted[0].direction).toBe('inbound');
    expect(dbState.inserted[0].imap_uid).toBe(130);
    expect(dbState.accountUpdate?.last_error).toBeNull();
    expect(dbState.accountUpdate?.last_uid).toBe(130);
  });

  it('erreur INSERT réelle → enregistrée dans errors + last_error (plus de silent failure)', async () => {
    dbState.insertError = { code: '42P10', message: 'no matching constraint' };
    mockModules();
    const { syncEmailAccount } = await import('./imap-sync');
    const r = await syncEmailAccount(mockDb(), 'a1');
    expect(r.inserted).toBe(0);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.ok).toBe(false);
    expect(dbState.accountUpdate?.last_error).toContain('no matching constraint');
  });
});
