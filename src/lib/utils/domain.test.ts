/**
 * P5.x.23-quater — tests helpers domaine.
 */

import { describe, it, expect } from 'vitest';
import { normalizeDomain, isValidDomain, cleanDomainList, extractEmailDomain } from './domain';

describe('normalizeDomain', () => {
  it('strips protocol + www. + trailing slash + path', () => {
    expect(normalizeDomain('https://www.francetv.fr/')).toBe('francetv.fr');
    expect(normalizeDomain('http://acme.com/some/path?q=1')).toBe('acme.com');
  });
  it('lowercases', () => {
    expect(normalizeDomain('FranceTV.FR')).toBe('francetv.fr');
  });
  it('strips port', () => {
    expect(normalizeDomain('localhost.fr:3000')).toBe('localhost.fr');
  });
  it('trims whitespace', () => {
    expect(normalizeDomain('  acme.com  ')).toBe('acme.com');
  });
  it('empty input → empty', () => {
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });
});

describe('isValidDomain', () => {
  it('accepts common TLDs', () => {
    expect(isValidDomain('acme.com')).toBe(true);
    expect(isValidDomain('francetv.fr')).toBe(true);
    expect(isValidDomain('sub.example.audio')).toBe(true);
    expect(isValidDomain('thisisaim.com')).toBe(true);
  });
  it('rejects invalid formats', () => {
    expect(isValidDomain('not a domain')).toBe(false);
    expect(isValidDomain('foo')).toBe(false);
    expect(isValidDomain('@invalid.com')).toBe(false);
    expect(isValidDomain('http://x.com')).toBe(false);
  });
  it('rejects too-long inputs', () => {
    expect(isValidDomain('a'.repeat(300) + '.com')).toBe(false);
  });
});

describe('cleanDomainList', () => {
  it('normalizes + dedupes case-insensitively', () => {
    expect(cleanDomainList(['https://Acme.com/', 'acme.com', 'foo.fr'])).toEqual([
      'acme.com',
      'foo.fr',
    ]);
  });
  it('filters invalid domains', () => {
    expect(cleanDomainList(['acme.com', 'invalid', 'foo.fr'])).toEqual(['acme.com', 'foo.fr']);
  });
  it('handles non-string entries', () => {
    expect(cleanDomainList(['acme.com', null, 42, 'foo.fr'])).toEqual(['acme.com', 'foo.fr']);
  });
  it('preserves order (first wins)', () => {
    expect(cleanDomainList(['z.com', 'a.com', 'z.com'])).toEqual(['z.com', 'a.com']);
  });
});

describe('extractEmailDomain', () => {
  it('extracts domain from valid email', () => {
    expect(extractEmailDomain('jean.dupont@francetv.fr')).toBe('francetv.fr');
    expect(extractEmailDomain('alice@ACME.COM')).toBe('acme.com');
  });
  it('returns null on invalid input', () => {
    expect(extractEmailDomain('not an email')).toBe(null);
    expect(extractEmailDomain('@no-local-part.com')).toBe(null);
    expect(extractEmailDomain('no-at-sign')).toBe(null);
    expect(extractEmailDomain('trailing-at@')).toBe(null);
    expect(extractEmailDomain(null)).toBe(null);
    expect(extractEmailDomain('')).toBe(null);
  });
  it('rejects invalid domain syntax', () => {
    expect(extractEmailDomain('user@invalid-no-tld')).toBe(null);
  });
});
