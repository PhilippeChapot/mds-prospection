/**
 * @vitest-environment node
 *
 * P6.x.2a — pure unit tests pour standStatusForProspectStatus.
 */

import { describe, it, expect } from 'vitest';
import { standStatusForProspectStatus } from './queries';

describe('standStatusForProspectStatus', () => {
  it('lead / contact / devis_envoye → reserve (stand bloqué pour ce prospect)', () => {
    expect(standStatusForProspectStatus('lead')).toBe('reserve');
    expect(standStatusForProspectStatus('contact')).toBe('reserve');
    expect(standStatusForProspectStatus('devis_envoye')).toBe('reserve');
  });

  it('acompte_paye / paye_integral / signe → paye (engagement financier acté)', () => {
    expect(standStatusForProspectStatus('acompte_paye')).toBe('paye');
    expect(standStatusForProspectStatus('paye_integral')).toBe('paye');
    expect(standStatusForProspectStatus('signe')).toBe('paye');
  });

  it('perdu → release (caller doit retirer l’assignation)', () => {
    expect(standStatusForProspectStatus('perdu')).toBe('release');
  });

  it('valeur inconnue → reserve (fallback safe)', () => {
    expect(standStatusForProspectStatus('unknown_status')).toBe('reserve');
  });
});
