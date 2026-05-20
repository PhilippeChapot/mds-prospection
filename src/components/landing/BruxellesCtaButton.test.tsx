/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a-decies — tests bouton CTA Bruxelles (ouvre la modale form contact).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BruxellesCtaButton } from './BruxellesCtaButton';
import { InstitutionnelEcoleFormProvider } from './institutionnel-ecole-form-context';
import { renderI18n } from './__test-helpers__/i18n-render';

// On stub la modale Form pour ne pas dependre du runtime react-hook-form/zod.
vi.mock('./InstitutionnelEcoleForm', () => ({
  InstitutionnelEcoleForm: ({ open, type }: { open: boolean; type: string }) =>
    open ? <div data-testid={`form-open-${type}`}>FORM-{type}</div> : null,
}));

describe('BruxellesCtaButton (P6.x.4-a-decies)', () => {
  it('rend un button (pas un anchor) avec aria-label fourni', () => {
    renderI18n(
      <InstitutionnelEcoleFormProvider>
        <BruxellesCtaButton label="Demander des infos" ariaLabel="MEDIADAYS BRUXELLES" />
      </InstitutionnelEcoleFormProvider>,
    );
    const btn = screen.getByRole('button', { name: 'MEDIADAYS BRUXELLES' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.textContent).toMatch(/Demander des infos/);
  });

  it("click → ouvre le form modal avec type='bruxelles' (lead source_detail='bruxelles')", () => {
    renderI18n(
      <InstitutionnelEcoleFormProvider>
        <BruxellesCtaButton label="Demander des infos" ariaLabel="MEDIADAYS BRUXELLES" />
      </InstitutionnelEcoleFormProvider>,
    );
    expect(screen.queryByTestId('form-open-bruxelles')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'MEDIADAYS BRUXELLES' }));
    expect(screen.getByTestId('form-open-bruxelles')).toBeInTheDocument();
    // Pas d'ouverture sur les 2 autres types
    expect(screen.queryByTestId('form-open-institutionnel')).toBeNull();
    expect(screen.queryByTestId('form-open-ecole')).toBeNull();
  });
});
