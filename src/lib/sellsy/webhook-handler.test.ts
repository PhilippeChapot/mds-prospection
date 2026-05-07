import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSellsyEvent, type SellsyWebhookEvent } from './webhook-handler';

describe('handleSellsyEvent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('event type non gere : log + ignore (pas de throw)', async () => {
    const event: SellsyWebhookEvent = {
      event_id: 'evt-test-1',
      type: 'document.created',
      data: { id: 123 },
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('unhandled-type'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('document.signed sans data.id : log error mais ne throw pas', async () => {
    const event: SellsyWebhookEvent = {
      event_id: 'evt-test-2',
      type: 'document.signed',
      data: {},
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const errorSpy = vi.mocked(console.error);
    const allCalls = errorSpy.mock.calls.map((args) => args.join(' ')).join(' | ');
    expect(allCalls).toContain('signed-no-doc-id');
  });

  it('document.paid sans data.id : log error mais ne throw pas', async () => {
    const event: SellsyWebhookEvent = {
      event_id: 'evt-test-3',
      type: 'document.paid',
      data: {},
    };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    const errorSpy = vi.mocked(console.error);
    const allCalls = errorSpy.mock.calls.map((args) => args.join(' ')).join(' | ');
    expect(allCalls).toContain('paid-no-doc-id');
  });

  it('event vide / mal forme : log unhandled-type fallback', async () => {
    const event: SellsyWebhookEvent = { event_id: 'evt-test-4' };
    await expect(handleSellsyEvent(event)).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('unhandled-type'),
      expect.anything(),
      expect.anything(),
    );
  });
});
