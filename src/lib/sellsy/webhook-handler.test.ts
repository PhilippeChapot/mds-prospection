import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSellsyEvent, type SellsyWebhookEvent } from './webhook-handler';

describe('handleSellsyEvent (Sellsy V2 webhook payload — quirks #22 + #23)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('event non gere (ex: client.created) : log unhandled-key (pas de throw)', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'client',
      event: 'created',
      timestamp: '1778187955',
      ownerid: '1084',
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('unhandled-key');
    expect(logs).toContain('client.created');
  });

  it('docslog.emailsent : log emailsent-skip avec relatedid', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'emailsent',
      timestamp: '1778187955',
      relatedid: '52437688',
      relatedtype: 'estimate',
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('emailsent-skip');
  });

  it('docslog.step sans relatedid : warn step-missing-related', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'step',
      timestamp: '1778187955',
      relatedobject: { id: 1, status: 'accepted' },
      // pas de relatedid
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const warns = vi
      .mocked(console.warn)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(warns).toContain('step-missing-related');
  });

  it('docslog.step status non tracke (draft / sent / expired) : log + skip', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'step',
      timestamp: '1778187955',
      relatedid: '52437688',
      relatedtype: 'estimate',
      relatedobject: { id: 52437688, status: 'draft' },
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const logs = vi
      .mocked(console.log)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(logs).toContain('step-status-not-tracked');
    expect(logs).toContain('draft');
  });

  it('docslog.step relatedtype inconnu : warn step-unknown-relatedtype', async () => {
    const event: SellsyWebhookEvent = {
      eventType: 'docslog',
      event: 'step',
      timestamp: '1778187955',
      relatedid: '52437688',
      // typed as `string` for tests, deliberate cast for unknown relatedtype:
      relatedtype: 'order' as 'estimate',
      relatedobject: { id: 52437688, status: 'accepted' },
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const warns = vi
      .mocked(console.warn)
      .mock.calls.map((c) => c.join(' '))
      .join(' | ');
    expect(warns).toContain('step-unknown-relatedtype');
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
