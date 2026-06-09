/**
 * @vitest-environment node
 *
 * P14.2.SalesCalendarGoogleSync — tests chiffrement AES-256-GCM.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, generateRandomSecret } from './encryption';

const ORIGINAL_KEY = process.env.CALENDAR_OAUTH_ENCRYPTION_KEY;

describe('encryption AES-256-GCM (P14.2)', () => {
  beforeEach(() => {
    process.env.CALENDAR_OAUTH_ENCRYPTION_KEY = 'test-key-please-change-32bytes-min-xxxxx';
  });
  afterEach(() => {
    process.env.CALENDAR_OAUTH_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it('roundtrip : decrypt(encrypt(x)) === x', () => {
    const secret = '1//0gFakeRefreshToken_abcDEF-123456789';
    const enc = encryptToken(secret);
    expect(decryptToken(enc)).toBe(secret);
  });

  it('produit un format iv:authTag:ciphertext (3 segments hex)', () => {
    const enc = encryptToken('hello');
    const parts = enc.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // iv 12 bytes = 24 hex
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // authTag 16 bytes = 32 hex
  });

  it('IV aléatoire : 2 chiffrements du même plaintext diffèrent', () => {
    const a = encryptToken('same');
    const b = encryptToken('same');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same');
    expect(decryptToken(b)).toBe('same');
  });

  it('détecte une altération du ciphertext (authTag GCM)', () => {
    const enc = encryptToken('tamper-me');
    const [iv, tag, ct] = enc.split(':');
    // Flip un caractère du ciphertext.
    const flipped = ct[0] === 'a' ? `b${ct.slice(1)}` : `a${ct.slice(1)}`;
    expect(() => decryptToken(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('rejette un format invalide', () => {
    expect(() => decryptToken('not-a-valid-payload')).toThrow(/format invalide/i);
  });

  it('generateRandomSecret retourne du hex de longueur attendue', () => {
    expect(generateRandomSecret(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(generateRandomSecret(24)).toMatch(/^[0-9a-f]{48}$/);
  });

  it('encryptToken throw si la clé est absente', () => {
    delete process.env.CALENDAR_OAUTH_ENCRYPTION_KEY;
    expect(() => encryptToken('x')).toThrow(/CALENDAR_OAUTH_ENCRYPTION_KEY/);
  });
});
