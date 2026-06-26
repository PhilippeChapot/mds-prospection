/**
 * @vitest-environment node
 *
 * P5.x.ReassignContactsToCompany — helpers purs.
 */

import { describe, it, expect } from 'vitest';
import {
  detectDomainMismatch,
  contactsWithDomainMismatch,
  emailDomain,
} from './contact-reassign-helpers';

describe('detectDomainMismatch', () => {
  it('même domaine → false (match)', () => {
    expect(detectDomainMismatch('jdupont@creacast.com', 'creacast.com')).toBe(false);
  });

  it('domaine différent (pro) → true (mismatch)', () => {
    expect(detectDomainMismatch('jdupont@radiofrance.fr', 'creacast.com')).toBe(true);
  });

  it('domaine perso (gmail) → false (ignoré)', () => {
    expect(detectDomainMismatch('jdupont@gmail.com', 'creacast.com')).toBe(false);
  });

  it('email vide → false', () => {
    expect(detectDomainMismatch('', 'creacast.com')).toBe(false);
    expect(detectDomainMismatch(null, 'creacast.com')).toBe(false);
  });

  it('target domain vide → false', () => {
    expect(detectDomainMismatch('jdupont@creacast.com', '')).toBe(false);
    expect(detectDomainMismatch('jdupont@creacast.com', null)).toBe(false);
  });

  it('casse insensible → false (match)', () => {
    expect(detectDomainMismatch('jd@CREACAST.com', 'creacast.com')).toBe(false);
    expect(detectDomainMismatch('jd@creacast.com', 'CreaCast.COM')).toBe(false);
  });

  it('email sans @ → false', () => {
    expect(detectDomainMismatch('pasunemail', 'creacast.com')).toBe(false);
  });
});

describe('emailDomain', () => {
  it('extrait le domaine en lowercase', () => {
    expect(emailDomain('Jean.Dupont@CreaCast.com')).toBe('creacast.com');
  });
  it('null pour email vide / sans @', () => {
    expect(emailDomain('')).toBeNull();
    expect(emailDomain(null)).toBeNull();
    expect(emailDomain('nope')).toBeNull();
  });
});

describe('contactsWithDomainMismatch', () => {
  const contacts = [
    { id: 'a', email: 'gilles@creacast.com', name: 'Gilles' },
    { id: 'b', email: 'eric@gmail.com', name: 'Eric' },
    { id: 'c', email: 'phil@autreboite.fr', name: 'Phil' },
  ];

  it('ne retourne que les contacts au domaine pro incohérent', () => {
    const r = contactsWithDomainMismatch(contacts, 'creacast.com');
    // gilles match (ok), eric perso (ignoré), phil mismatch
    expect(r.map((c) => c.id)).toEqual(['c']);
  });

  it('target domain null → aucun mismatch', () => {
    expect(contactsWithDomainMismatch(contacts, null)).toEqual([]);
  });
});
