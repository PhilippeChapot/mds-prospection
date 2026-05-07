import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSellsyEvent, type SellsyWebhookEvent } from './webhook-handler';

describe('handleSellsyEvent (Sellsy V2 webhook shape : eventType + event)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('event non gere : log unhandled-key + payload partiel (pas de throw)', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'client',
      event: 'created',
      timestamp: '1778187955',
      ownerid: '1084',
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const allLogs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(allLogs).toContain('unhandled-key');
    expect(allLogs).toContain('client.created');
  });

  it('docslog.emailsent : log + skip (pas de processing)', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'emailsent',
      timestamp: '1778187955',
      docid: '12345',
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('emailsent-skip');
  });

  it('docslog.step sans docid : log error mais ne throw pas', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'step',
      timestamp: '1778187955',
      step: 'Signé',
      // pas de docid
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const errors = vi
      .mocked(console.error)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(errors).toContain('step-no-doc-id');
  });

  it('docslog.step avec status non tracke : log + skip', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'step',
      timestamp: '1778187955',
      docid: '12345',
      step: 'Brouillon', // ni signe ni paye
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('step-status-not-tracked');
  });

  it('event vide : tombe en unhandled-key (pas de throw)', async () => {
    const event: SellsyWebhookEvent = {};
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('unhandled-key');
  });
});
