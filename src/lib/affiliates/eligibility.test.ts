/**
 * @vitest-environment node
 *
 * P7.x.1.D — tests isCommissionEligibleForCompany (pure).
 */

import { describe, it, expect } from 'vitest';
import { isCommissionEligibleForCompany } from './eligibility';

describe('isCommissionEligibleForCompany (P7.x.1.D)', () => {
  it("false pour 'prs_exhibitor' (exclu du programme commission)", () => {
    expect(isCommissionEligibleForCompany({ category: 'prs_exhibitor' })).toBe(false);
  });

  it("true pour 'standard' (eligible)", () => {
    expect(isCommissionEligibleForCompany({ category: 'standard' })).toBe(true);
  });

  it("true pour 'non_eligible' (la category 'non_eligible' concerne le tarif, pas la commission)", () => {
    expect(isCommissionEligibleForCompany({ category: 'non_eligible' })).toBe(true);
  });

  it('true pour null/undefined (retro-compat anciennes companies sans category)', () => {
    expect(isCommissionEligibleForCompany({ category: null })).toBe(true);
  });
});
