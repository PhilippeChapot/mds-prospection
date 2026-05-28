/**
 * @vitest-environment jsdom
 *
 * P8.3-ter — tests preview campagne.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CampaignBodyPreview } from './CampaignBodyPreview';

describe('CampaignBodyPreview (P8.3-ter)', () => {
  it('rend une iframe avec srcDoc contenant le wrapper MDS', () => {
    const { container } = render(
      <CampaignBodyPreview
        bodyHtml="<p>Hello {prenom}</p>"
        subject="Bonjour {prenom}"
        locale="fr"
      />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';
    // Wrapper MDS applique.
    expect(srcDoc).toContain('MediaDays Solutions 2026');
    expect(srcDoc).toContain('Éditions HF');
    // Body inject + variables substituees.
    expect(srcDoc).toContain('Hello Prénom Démo');
    expect(srcDoc).toContain('Bonjour Prénom Démo');
    expect(srcDoc).not.toContain('{prenom}');
  });

  it('respecte la locale (footer EN)', () => {
    const { container } = render(
      <CampaignBodyPreview bodyHtml="<p>Hi</p>" subject="Hello" locale="en" />,
    );
    const iframe = container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcDoc).toContain('Manage my preferences');
  });

  it('iframe sandboxed (allow-same-origin) sans allow-scripts', () => {
    const { container } = render(
      <CampaignBodyPreview bodyHtml="<p>X</p>" subject="X" locale="fr" />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-same-origin');
    // Pas de scripts autorises (defense XSS si le body contient un script).
    expect(iframe?.getAttribute('sandbox') ?? '').not.toContain('allow-scripts');
  });

  it('sampleContact override change la substitution', () => {
    const { container } = render(
      <CampaignBodyPreview
        bodyHtml="<p>Hello {prenom} de {societe}</p>"
        subject="X"
        locale="fr"
        sampleContact={{ first_name: 'Alice', company_name: 'Acme SAS' }}
      />,
    );
    const iframe = container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';
    expect(srcDoc).toContain('Hello Alice de Acme SAS');
  });
});
