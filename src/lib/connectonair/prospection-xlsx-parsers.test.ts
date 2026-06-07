/**
 * @vitest-environment node
 *
 * P5.x.PhoneEnrichmentDisplay-bis — tests parseurs xlsx Prospection.
 *
 * On ne teste pas la couche Supabase (I/O reseau) ici. Couvre uniquement
 * les pure-functions parseSocietes / parseContacts via un fixture xlsx
 * en memoire.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSocietes, parseContacts } from '../../../scripts/enrich-phones-from-prospection-xlsx';

function buildFixture(): string {
  const societesHeader = [
    'Société',
    'Salon / Source tag',
    'Cible commerciale',
    'Source enrichissement',
    'URL',
    'Téléphone standard',
    'Email générique',
  ];
  const societesRows = [
    // 1. FR fixe avec tirets + URL
    [
      'A.T.S. France - NAGRA AUDIO',
      'ConnectOnAir',
      'MDS',
      'ConnectOnAir',
      'https://nagraaudio.com',
      '01-70-71-61-00',
      'matthieu.latour@nagraaudio.com',
    ],
    // 2. ES nu sans +
    ['ACAST Spain', 'ConnectOnAir', 'MDS', 'ConnectOnAir', 'https://acast.es', '34699248200', null],
    // 3. IL nu sans +
    [
      'ABonAir',
      'ConnectOnAir',
      'MDS',
      'ConnectOnAir',
      'https://abonair.com',
      '972 9 744 0055',
      null,
    ],
    // 4. Sans phone → skip phone mais ligne presente
    ['NoPhone SA', 'ConnectOnAir', 'MDS', 'ConnectOnAir', 'https://nophone.fr', null, null],
    // 5. Garbage phone → parsedFail
    ['Garbage Co', 'ConnectOnAir', 'MDS', 'ConnectOnAir', null, 'abcdefg', null],
    // 6. Sans nom → skip (rows[1+] empty)
    [null, null, null, null, null, '0142367890', null],
  ];

  const contactsHeader = [
    'Société',
    'Nom',
    'Prénom',
    'Fonction',
    'Email direct',
    'Téléphone direct',
  ];
  const contactsRows = [
    ['20 Minutes', 'CHOLLET', 'Lucie', 'Presse & Com', 'lchollet@20minutes.fr', null],
    ['NAGRA', 'Latour', 'Matthieu', 'CTO', 'matthieu.latour@nagraaudio.com', '+33 6 74 15 04 57'],
    // Email malforme → skip
    ['Foo', 'X', 'Y', 'Z', 'pas-un-email', '0142367890'],
    ['ACAST', 'Doe', 'Jane', 'Sales', 'jane@acast.com', '+34 699 248 200'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([societesHeader, ...societesRows]),
    'Sociétés',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([contactsHeader, ...contactsRows]),
    'Contacts',
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospection-test-'));
  const filePath = path.join(tmpDir, 'fixture.xlsx');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

describe('parseSocietes (P5.x.PhoneEnrichmentDisplay-bis)', () => {
  it('Parse les rows non-vides + normalise les phones', () => {
    const filePath = buildFixture();
    const rows = parseSocietes(filePath);
    // 5 rows valides (sans la row sans nom).
    expect(rows).toHaveLength(5);

    // Phone FR avec tirets → E.164.
    expect(rows[0].name).toBe('A.T.S. France - NAGRA AUDIO');
    expect(rows[0].phone_e164).toBe('+33170716100');

    // ES nu → detecte le country code.
    const acast = rows.find((r) => r.name === 'ACAST Spain');
    expect(acast?.phone_e164).toBe('+34699248200');

    // IL nu avec espaces → detecte.
    const abonair = rows.find((r) => r.name === 'ABonAir');
    expect(abonair?.phone_e164).toBe('+97297440055');

    // Sans phone → phone_e164 null.
    const noPhone = rows.find((r) => r.name === 'NoPhone SA');
    expect(noPhone?.phone_e164).toBeNull();

    // Garbage → phone_e164 null mais row gardee (phone_raw present).
    const garbage = rows.find((r) => r.name === 'Garbage Co');
    expect(garbage?.phone_raw).toBe('abcdefg');
    expect(garbage?.phone_e164).toBeNull();
  });
});

describe('parseContacts (P5.x.PhoneEnrichmentDisplay-bis)', () => {
  it('Parse les rows + normalise email LOWER+TRIM + phone E.164', () => {
    const filePath = buildFixture();
    const rows = parseContacts(filePath);
    // 3 rows avec email valide (skip "pas-un-email").
    expect(rows).toHaveLength(3);

    // Email normalise.
    expect(rows[0].email_normalized).toBe('lchollet@20minutes.fr');
    // Pas de phone → phone_e164 null.
    expect(rows[0].phone_e164).toBeNull();

    // Phone FR international avec espaces → E.164.
    const latour = rows.find((r) => r.email_normalized === 'matthieu.latour@nagraaudio.com');
    expect(latour?.phone_e164).toBe('+33674150457');

    // Phone ES avec + + espaces → E.164.
    const jane = rows.find((r) => r.email_normalized === 'jane@acast.com');
    expect(jane?.phone_e164).toBe('+34699248200');
  });
});
