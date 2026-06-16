/**
 * @vitest-environment node
 *
 * P15.4 — la génération PDF produit bien un document PDF (FR + EN).
 */
import { describe, it, expect } from 'vitest';
import { generateInvitationPdf } from './generate-invitation';

const recipient = {
  company_name: 'ACME Media',
  company_full_address: '1 rue des Tests',
  postal_code: '75001',
  city: 'Paris',
  country: 'France',
  nationality: 'Tunisienne',
  birth_date: '1990-01-01',
  birth_place: 'Tunis',
  profession: 'Journaliste',
  passport_number: 'AB123456',
  passport_issue_date: '2020-01-01',
  passport_expiry: '2030-01-01',
};

describe('generateInvitationPdf (P15.4)', () => {
  it('génère un PDF valide en FR', async () => {
    const buf = await generateInvitationPdf({
      locale: 'fr',
      generatedDate: '16 juin 2026',
      recipient,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('génère un PDF valide en EN', async () => {
    const buf = await generateInvitationPdf({
      locale: 'en',
      generatedDate: '16 June 2026',
      recipient,
    });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
