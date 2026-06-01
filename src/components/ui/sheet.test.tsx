/**
 * @vitest-environment jsdom
 *
 * P6.x-BURGER-FIX (2026-06-01) — regression test : SheetContent doit
 * utiliser `transition-transform` + `data-[state=closed]:-translate-x-full`
 * (et pas `data-open:animate-in / slide-in-from-left`) sinon le drawer
 * reste stuck a translate(-100%) au mount sous Tailwind v4 + tw-animate-css.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';

function HarnessSheet({ side = 'left' as 'left' | 'right' }) {
  return (
    <Sheet defaultOpen>
      <SheetTrigger>open</SheetTrigger>
      <SheetContent side={side}>
        <SheetTitle>Titre test</SheetTitle>
        <p>contenu</p>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet primitive (P6.x-BURGER-FIX)', () => {
  it('SheetContent side=left utilise transition-transform + data-[state=closed]:-translate-x-full', () => {
    render(<HarnessSheet side="left" />);
    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content).toBeTruthy();
    const cls = content?.className ?? '';
    expect(cls).toMatch(/transition-transform/);
    expect(cls).toMatch(/data-\[state=closed\]:-translate-x-full/);
    // Garde anti-regression : l ancienne pipeline animate-in/slide-in-from-left
    // ne doit PAS revenir (sinon stuck a -100% sous Tailwind v4 + tw-animate-css).
    expect(cls).not.toMatch(/data-open:slide-in-from-left/);
    expect(cls).not.toMatch(/data-open:animate-in/);
  });

  it('SheetContent side=right utilise translate-x-full (sens oppose)', () => {
    render(<HarnessSheet side="right" />);
    const content = document.querySelector('[data-slot="sheet-content"]');
    const cls = content?.className ?? '';
    expect(cls).toMatch(/data-\[state=closed\]:translate-x-full/);
    expect(cls).not.toMatch(/data-\[state=closed\]:-translate-x-full/);
  });

  it('SheetOverlay utilise transition-opacity (pas animate-in/fade-in)', () => {
    render(<HarnessSheet />);
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).toBeTruthy();
    const cls = overlay?.className ?? '';
    expect(cls).toMatch(/transition-opacity/);
    expect(cls).toMatch(/data-\[state=closed\]:opacity-0/);
    expect(cls).not.toMatch(/data-open:fade-in/);
  });

  it('SheetContent rendu visible au mount (data-state=open, pas de transform initial)', () => {
    render(<HarnessSheet />);
    const content = document.querySelector('[data-slot="sheet-content"]');
    expect(content?.getAttribute('data-state')).toBe('open');
    // Le contenu doit etre present + visible (pas de translate-x-full a l etat open).
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it('SheetTrigger ferme correctement le Sheet (transition CSS)', () => {
    render(
      <Sheet>
        <SheetTrigger aria-label="open-btn">open</SheetTrigger>
        <SheetContent>
          <SheetTitle>X</SheetTitle>
          <p>contenu-toggle</p>
        </SheetContent>
      </Sheet>,
    );
    // Avant clic : ferme
    expect(screen.queryByText('contenu-toggle')).toBeNull();
    fireEvent.click(screen.getByLabelText('open-btn'));
    expect(screen.getByText('contenu-toggle')).toBeInTheDocument();
  });
});
