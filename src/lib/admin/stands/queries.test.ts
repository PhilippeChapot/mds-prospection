/**
 * @vitest-environment node
 *
 * P6.x.2a + P5.x.StandStatusReserveSigne — pure unit tests pour standStatusForProspectStatus.
 */

import { describe, it, expect } from 'vitest';
import { standStatusForProspectStatus } from './queries';

describe('standStatusForProspectStatus', () => {
  it('lead / contact / devis_envoye → reserve (stand bloqué pour ce prospect)', () => {
    expect(standStatusForProspectStatus('lead')).toBe('reserve');
    expect(standStatusForProspectStatus('contact')).toBe('reserve');
    expect(standStatusForProspectStatus('devis_envoye')).toBe('reserve');
  });

  it('signe → reserve_signe (contrat signé, acompte pas encore reçu)', () => {
    expect(standStatusForProspectStatus('signe')).toBe('reserve_signe');
  });

  it('acompte_paye / paye_integral → paye (engagement financier réel)', () => {
    expect(standStatusForProspectStatus('acompte_paye')).toBe('paye');
    expect(standStatusForProspectStatus('paye_integral')).toBe('paye');
  });

  it("perdu → release (caller doit retirer l'assignation)", () => {
    expect(standStatusForProspectStatus('perdu')).toBe('release');
  });

  it('valeur inconnue → reserve (fallback safe)', () => {
    expect(standStatusForProspectStatus('unknown_status')).toBe('reserve');
  });
});
