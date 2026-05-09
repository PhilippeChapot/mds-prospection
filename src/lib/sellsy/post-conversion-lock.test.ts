import { describe, it, expect } from 'vitest';

/**
 * Bug F — verifie le pattern d'idempotence : si deux INSERT concurrents
 * sur sellsy_emit_locks (PK prospect_id) tentent d'acquerir le lock,
 * un seul reussit et l'autre recoit un conflict 23505.
 *
 * Note : test logique pure (simulation du comportement PG ON CONFLICT).
 * Le vrai test de la fonction `acquireEmitLock` necessiterait une DB
 * de test ou un mock complet de Supabase — couverture E2E faite cote
 * staging (re-clic frenetique du bouton "Emettre devis Sellsy").
 */

describe('emit-lock idempotence (PG ON CONFLICT pattern)', () => {
  it('simule : 5 INSERT concurrents sur la meme PK -> 1 reussit, 4 echouent en 23505', () => {
    // Simule le set de PG : INSERT INTO sellsy_emit_locks (prospect_id) VALUES (...)
    // Chaque INSERT renvoie soit OK (1ere fois), soit error code 23505 (PK violation).
    const acquired = new Set<string>();
    const tryInsert = (prospectId: string) => {
      if (acquired.has(prospectId)) return { ok: false, code: '23505' as const };
      acquired.add(prospectId);
      return { ok: true };
    };

    const prospectId = 'p1';
    const results = Array.from({ length: 5 }, () => tryInsert(prospectId));

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(4);
    expect(losers.every((r) => !r.ok && r.code === '23505')).toBe(true);
  });

  it('apres release (DELETE), un nouveau INSERT pour le meme prospect reussit', () => {
    const acquired = new Set<string>();
    const tryInsert = (id: string) => {
      if (acquired.has(id)) return { ok: false };
      acquired.add(id);
      return { ok: true };
    };
    const release = (id: string) => acquired.delete(id);

    expect(tryInsert('p1').ok).toBe(true);
    expect(tryInsert('p1').ok).toBe(false); // 2e tentative bloquee
    release('p1');
    expect(tryInsert('p1').ok).toBe(true); // OK apres release
  });
});
