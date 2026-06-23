/**
 * @vitest-environment node
 *
 * Garde de régression — P5.x.SellsyDocumentsFlow (fix 0103).
 *
 * Migration 0103 a ajouté `billing_contact_id REFERENCES contacts(id)` sur
 * prospects, créant une 2e FK prospects→contacts. Dès lors, tout embed
 * PostgREST écrit `contact:contacts(...)` SANS hint FK devient ambigu
 * (erreur PGRST201) → la query retourne 0 ligne silencieusement (bug
 * "Prospects · 0", + chemins paiement/sync cassés).
 *
 * Ce test scanne tout src/ et échoue si un embed `contact:contacts(` est
 * écrit sans hint explicite (`!primary_contact_id` ou `!billing_contact_id`).
 * Les mocks unitaires ne reproduisent pas l'ambiguïté PostgREST réelle ;
 * ce garde statique est la protection.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../..'); // -> src/

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('PostgREST embeds — disambiguation FK prospects→contacts (régression 0103)', () => {
  it('aucun embed `contact:contacts(` sans hint FK dans src/', () => {
    const files = walk(SRC);
    // Match `contact:contacts(` NON suivi de `!` (donc sans hint FK).
    const ambiguous = /contact:contacts\(/;
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      // Le test lui-même contient le motif dans sa doc → on l'exclut.
      if (file.endsWith('select-fk-hints.test.ts')) continue;
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (ambiguous.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1} → ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Embeds prospects→contacts ambigus (ajoutez !primary_contact_id ou !billing_contact_id) :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
