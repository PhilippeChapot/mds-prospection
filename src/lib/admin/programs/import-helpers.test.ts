/**
 * @vitest-environment node
 *
 * P16.x.ImportPrograms — tests ensureContactForSpeaker (personne vs org) + slug.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureContactForSpeaker, slugifyEmailPart } from './import-helpers';
import type { ParsedSpeaker } from './parse-program';

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

function makeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: { id: table === 'companies' ? 'co-1' : 'ct-1' },
                error: null,
              }),
            }),
          };
        },
      };
      return chain;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  inserts.length = 0;
});

describe('slugifyEmailPart (P16.x)', () => {
  it('déburre + remplace non-alphanum par points', () => {
    expect(slugifyEmailPart('Nicolas Jaïmes')).toBe('nicolas.jaimes');
  });
});

describe('ensureContactForSpeaker (P16.x)', () => {
  it('personne nommée → contact réel + email placeholder déterministe', async () => {
    const sp: ParsedSpeaker = {
      kind: 'person',
      displayName: 'Nicolas Jaimes',
      firstName: 'Nicolas',
      lastName: 'Jaimes',
      org: 'Open Garden',
      role: null,
    };
    const res = await ensureContactForSpeaker(makeSupabase(), sp);
    expect(res.isPlaceholder).toBe(false);
    expect(res.email).toBe('nicolas.jaimes.open.garden@placeholder-imported.local');
    const contact = inserts.find((i) => i.table === 'contacts');
    expect(contact?.row.first_name).toBe('Nicolas');
    expect(contact?.row.last_name).toBe('Jaimes');
    expect(contact?.row.company_id).toBe('co-1');
  });

  it('org seule → contact placeholder "À identifier @ {org}"', async () => {
    const sp: ParsedSpeaker = {
      kind: 'org',
      displayName: 'WorldDAB',
      firstName: null,
      lastName: null,
      org: 'WorldDAB',
      role: null,
    };
    const res = await ensureContactForSpeaker(makeSupabase(), sp);
    expect(res.isPlaceholder).toBe(true);
    expect(res.email).toBe('placeholder.worlddab@placeholder-imported.local');
    const contact = inserts.find((i) => i.table === 'contacts');
    expect(contact?.row.first_name).toBe('À identifier');
    expect(contact?.row.last_name).toBe('@ WorldDAB');
  });
});
