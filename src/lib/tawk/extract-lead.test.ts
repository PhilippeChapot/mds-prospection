/**
 * P9.1 — tests de l'extraction de lead depuis un payload Tawk.to.
 */

import { describe, it, expect } from 'vitest';
import { extractLeadFromPayload } from './extract-lead';

describe('extractLeadFromPayload (P9.1)', () => {
  it('ticket:create avec email -> kind=lead + champs OK', () => {
    const r = extractLeadFromPayload({
      event: 'ticket:create',
      time: '2026-05-27T10:00:00.000Z',
      requester: { name: 'Alice Martin', email: 'Alice@Example.com' },
      property: { id: 'p1', name: 'mediadays.solutions' },
      ticket: {
        id: 'tkt-123',
        humanId: '#42',
        subject: 'Demande tarif',
        message: 'Bonjour, je suis interesse par un stand',
      },
    });
    expect(r.kind).toBe('lead');
    if (r.kind === 'lead') {
      expect(r.lead.email).toBe('alice@example.com'); // lowercase
      expect(r.lead.name).toBe('Alice Martin');
      expect(r.lead.message).toContain('Demande tarif');
      expect(r.lead.message).toContain('Bonjour');
      expect(r.lead.pageUrl).toBe('mediadays.solutions');
      expect(r.lead.externalId).toBe('tkt-123');
    }
  });

  it('ticket:create sans requester.email -> kind=no_email', () => {
    const r = extractLeadFromPayload({
      event: 'ticket:create',
      requester: { name: 'Bob' },
      ticket: { message: 'plop' },
    });
    expect(r.kind).toBe('no_email');
  });

  it('chat:transcript_created concatene les messages visiteur uniquement', () => {
    const r = extractLeadFromPayload({
      event: 'chat:transcript_created',
      chat: {
        id: 'chat-9',
        visitor: { name: 'Carla', email: 'carla@acme.fr' },
        messages: [
          { sender: { type: 'agent' }, type: 'msg', msg: 'Bonjour, comment puis-je aider ?' },
          { sender: { type: 'visitor' }, type: 'msg', msg: 'Je veux un tarif stand' },
          { sender: { type: 'visitor' }, type: 'msg', msg: 'Pour 4 personnes' },
        ],
      },
      property: { name: 'mediadays.solutions' },
    });
    expect(r.kind).toBe('lead');
    if (r.kind === 'lead') {
      expect(r.lead.email).toBe('carla@acme.fr');
      expect(r.lead.message).toBe('Je veux un tarif stand\nPour 4 personnes');
      expect(r.lead.externalId).toBe('chat-9');
      // Le message agent ne doit PAS apparaitre.
      expect(r.lead.message).not.toContain('comment puis-je aider');
    }
  });

  it("chat:start -> kind=skip (V1 : pas de capture a l'ouverture)", () => {
    const r = extractLeadFromPayload({
      event: 'chat:start',
      visitor: { name: 'X', email: 'x@y.fr' },
    });
    expect(r.kind).toBe('skip');
    if (r.kind === 'skip') expect(r.event).toBe('chat:start');
  });

  it('chat:end -> kind=skip', () => {
    const r = extractLeadFromPayload({
      event: 'chat:end',
      visitor: { name: 'X', email: 'x@y.fr' },
    });
    expect(r.kind).toBe('skip');
  });

  it('event inconnu -> kind=skip', () => {
    const r = extractLeadFromPayload({ event: 'random:event_42' });
    expect(r.kind).toBe('skip');
  });

  it('payload invalide (null / not object) -> skip', () => {
    expect(extractLeadFromPayload(null).kind).toBe('skip');
    expect(extractLeadFromPayload('foo').kind).toBe('skip');
    expect(extractLeadFromPayload(42).kind).toBe('skip');
  });
});
