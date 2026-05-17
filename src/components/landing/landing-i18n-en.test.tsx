/**
 * @vitest-environment jsdom
 *
 * P6.x.4-a-ter — tests EN locale pour les composants landing.
 *
 * Couvre :
 *   - PolesExplorer rend les noms EN
 *   - PolesExplorer rend la description nettoyée DIFFUSION (pas de SATIS)
 *   - PolesExplorer rend la description nettoyée VIDÉO (pas de SATIS)
 *   - VisitorFamiliesExplorer rend les noms EN (famille 11/13 inclus)
 *   - InstitutionnelEcoleForm rend les labels EN + bouton submit EN
 *   - Subsector translations table contient les libellés EN clés
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { PolesExplorer } from './PolesExplorer';
import { VisitorFamiliesExplorer } from './VisitorFamiliesExplorer';
import { InstitutionnelEcoleForm } from './InstitutionnelEcoleForm';
import { InstitutionnelEcoleFormProvider } from './institutionnel-ecole-form-context';
import { getTaxonomy } from '@/lib/landing/taxonomy';
import { getSubSectorLabel } from '@/lib/landing/subsector-translations';
import { renderI18n } from './__test-helpers__/i18n-render';

// On évite l'appel réel à la server action
vi.mock('@/lib/landing/institutionnel-ecole-actions', () => ({
  submitInstitutionnelEcoleRequest: vi.fn().mockResolvedValue({ ok: true, request_id: 'x' }),
}));

const tax = getTaxonomy();

describe('Landing — EN locale (P6.x.4-a-ter)', () => {
  it('PolesExplorer rend les 6 noms EN (MEDIA AGENCIES, BROADCAST & INFRASTRUCTURE…)', () => {
    renderI18n(<PolesExplorer poles={tax.poles} />, { locale: 'en' });
    expect(screen.getAllByText('MEDIA AGENCIES & RETAIL MEDIA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BROADCAST & INFRASTRUCTURE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VIDEO & CTV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DATA & ADTECH').length).toBeGreaterThan(0);
  });

  it('DIFFUSION & INFRA EN description ne contient PLUS aucune mention concurrent (SATIS)', () => {
    renderI18n(<PolesExplorer poles={tax.poles} />, { locale: 'en' });
    fireEvent.click(screen.getAllByText('BROADCAST & INFRASTRUCTURE')[0].closest('button')!);
    // EN description should mention DTT/5G operators but never "SATIS" / "competitor"
    expect(screen.getAllByText(/DTT\/5G operators/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/SATIS|competitor/i);
  });

  it('VIDEO & CTV EN description ne mentionne PAS SATIS / concurrence', () => {
    renderI18n(<PolesExplorer poles={tax.poles} />, { locale: 'en' });
    fireEvent.click(screen.getAllByText('VIDEO & CTV')[0].closest('button')!);
    expect(screen.getAllByText(/pro video production/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/SATIS|competitor/i);
  });

  it('VisitorFamiliesExplorer rend la famille 11 en EN ("Industry bodies & associations")', () => {
    renderI18n(
      <InstitutionnelEcoleFormProvider>
        <VisitorFamiliesExplorer families={tax.visiteurs} poles={tax.poles} />
      </InstitutionnelEcoleFormProvider>,
      { locale: 'en' },
    );
    expect(screen.getAllByText('Industry bodies & associations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Schools & Education').length).toBeGreaterThan(0);
  });

  it('InstitutionnelEcoleForm rend labels EN + bouton submit "Submit my request"', () => {
    renderI18n(
      <InstitutionnelEcoleForm open={true} onOpenChange={() => undefined} type="institutionnel" />,
      { locale: 'en' },
    );
    expect(screen.getAllByText(/Request institutional pricing/).length).toBeGreaterThan(0);
    expect(screen.getByText('Submit my request')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('subsector-translations table : 5 clés représentatives mappées', () => {
    expect(getSubSectorLabel('Régies TV', 'en')).toBe('TV media agencies');
    expect(getSubSectorLabel('Opérateurs FM / DAB+', 'en')).toBe('FM / DAB+ operators');
    expect(getSubSectorLabel('IA voix / synthèse vocale', 'en')).toBe('Voice AI / TTS');
    expect(getSubSectorLabel('Plateformes DOOH / Programmatique DOOH', 'en')).toBe(
      'DOOH platforms / Programmatic DOOH',
    );
    expect(getSubSectorLabel('Régies TV', 'fr')).toBe('Régies TV');
  });
});
