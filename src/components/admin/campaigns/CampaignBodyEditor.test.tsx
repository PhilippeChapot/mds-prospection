/**
 * @vitest-environment jsdom
 *
 * P8.3-ter — smoke tests editeur WYSIWYG TipTap.
 *
 * Note : TipTap + jsdom a des limitations (ProseMirror utilise des APIs
 * DOM avancees). On limite ici aux tests smoke : presence des boutons
 * toolbar + toggle HTML/visual. Les interactions riches (Bold ajoute
 * <strong>) sont testees en E2E dans un vrai navigateur (Phil teste live).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampaignBodyEditor } from './CampaignBodyEditor';

describe('CampaignBodyEditor (P8.3-ter smoke)', () => {
  it('rend la toolbar avec les boutons Bold/Italic/Underline + toggle HTML', () => {
    render(<CampaignBodyEditor value="<p>Hello</p>" onChange={vi.fn()} />);
    // Toolbar buttons via aria-label.
    expect(screen.getByLabelText('Gras')).toBeTruthy();
    expect(screen.getByLabelText('Italique')).toBeTruthy();
    expect(screen.getByLabelText('Souligné')).toBeTruthy();
    expect(screen.getByLabelText('Titre 1')).toBeTruthy();
    expect(screen.getByLabelText('Liste à puces')).toBeTruthy();
    // Toggle HTML.
    const checkbox = screen.getByLabelText('HTML') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it('toggle HTML : checkbox bascule en mode HTML brut (Textarea visible)', () => {
    render(<CampaignBodyEditor value="<p>Hello</p>" onChange={vi.fn()} />);
    const checkbox = screen.getByLabelText('HTML') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    // Apres switch html, le Textarea contient le HTML.
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('bouton Variable ouvre le menu avec {prenom} {societe} {etape}', () => {
    render(<CampaignBodyEditor value="<p>Hello</p>" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Variable'));
    expect(screen.getByText('{prenom}')).toBeTruthy();
    expect(screen.getByText('{societe}')).toBeTruthy();
    expect(screen.getByText('{etape}')).toBeTruthy();
  });
});
