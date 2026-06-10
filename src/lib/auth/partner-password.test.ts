/**
 * P11.x — tests helpers bcrypt + validation.
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from './partner-password';

describe('partner-password helpers (P11.x)', () => {
  it('hashPassword + verifyPassword round-trip', async () => {
    const hash = await hashPassword('MyP4ssword!');
    expect(hash).toMatch(/^\$2[ab]\$12\$/); // bcrypt cost=12
    const valid = await verifyPassword('MyP4ssword!', hash);
    expect(valid).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correct');
    const result = await verifyPassword('wrong', hash);
    expect(result).toBe(false);
  });

  it('validatePasswordStrength accepts 8+ char password', () => {
    expect(validatePasswordStrength('abcdefgh')).toBeNull();
  });

  it('validatePasswordStrength rejects < 8 chars', () => {
    expect(validatePasswordStrength('short')).not.toBeNull();
  });

  it('validatePasswordStrength rejects > 200 chars', () => {
    const long = 'a'.repeat(201);
    expect(validatePasswordStrength(long)).not.toBeNull();
  });
});
