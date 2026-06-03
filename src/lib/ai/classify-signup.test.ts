import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifySignup, extractEmailDomain } from './classify-signup';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

describe('classifySignup', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (originalApiKey !== undefined) process.env.ANTHROPIC_API_KEY = originalApiKey;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  const baseInput = {
    companyName: 'NRJ Group',
    companyCountry: 'FR',
    contactFirstName: 'Jean',
    contactLastName: 'Dupont',
    category: 'partenaire' as const,
    emailDomain: 'nrj.fr',
  };

  it('parses a valid JSON response from Claude', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '{"pole_code": "AUDIO_RADIO", "confidence": 0.95, "reasoning": "Major French radio group."}',
        },
      ],
      usage: { input_tokens: 120, output_tokens: 35 },
    });

    const result = await classifySignup(baseInput);
    expect(result).not.toBeNull();
    expect(result?.poleCode).toBe('AUDIO_RADIO');
    expect(result?.confidence).toBe(0.95);
    expect(result?.reasoning).toContain('radio');
    expect(result?.tokensIn).toBe(120);
    expect(result?.tokensOut).toBe(35);
  });

  it('returns null when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await classifySignup(baseInput);
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns null when response is not parseable JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I could not classify.' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await classifySignup(baseInput);
    expect(result).toBeNull();
  });

  it('returns null when pole_code is invalid', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '{"pole_code": "MADE_UP_POLE", "confidence": 0.9, "reasoning": "..."}',
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = await classifySignup(baseInput);
    expect(result).toBeNull();
  });

  it('returns null on API error (network, etc)', async () => {
    mockCreate.mockRejectedValue(new Error('network down'));
    const result = await classifySignup(baseInput);
    expect(result).toBeNull();
  });

  it('clamps confidence to [0, 1]', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '{"pole_code": "DATA_ADTECH", "confidence": 1.5, "reasoning": "x"}',
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const result = await classifySignup(baseInput);
    expect(result?.confidence).toBe(1);
  });
});

describe('extractEmailDomain', () => {
  it('extracts the domain from a valid email', () => {
    expect(extractEmailDomain('philippe@mediadays.solutions')).toBe('mediadays.solutions');
    expect(extractEmailDomain('Test@EXAMPLE.COM')).toBe('example.com');
  });

  it('returns null for invalid emails', () => {
    expect(extractEmailDomain('no-at-sign')).toBeNull();
    expect(extractEmailDomain('@no-local')).toBeNull();
    expect(extractEmailDomain('no-domain@')).toBeNull();
  });
});
