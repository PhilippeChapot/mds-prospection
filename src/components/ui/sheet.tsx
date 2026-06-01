'use client';

/**
 * P5.x.17 — primitive Sheet minimal (drawer lateral) construit sur
 * radix-ui Dialog. Reprend la meme API que shadcn/ui Sheet pour
 * permettre un swap futur si shadcn est installe (compatibilite).
 *
 * Utilise par le menu mobile de l'Espace Exposant + admin sidebar burger.
 * On garde la surface API a strict minimum : Root/Trigger/Content +
 * Title/Description (Title est requis par Radix pour l'a11y).
 *
 * P6.x-BURGER-FIX (2026-06-01) : remplacement de l animation keyframe
 * `data-open:animate-in / data-open:slide-in-from-left` par une simple
 * `transition-transform + data-[state=closed]:-translate-x-full`. Avec
 * Tailwind v4 + tw-animate-css + Radix data-state="open"/"closed", la
 * pipeline animate-in/keyframes "enter" laissait `--tw-enter-translate-x`
 * = -100% appliquee SANS jamais lancer l animation (bug observe en mobile
 * Chrome DevTools) -> SheetContent stuck hors ecran a gauche, burger
 * apparait clickable mais le contenu reste invisible. La transition CSS
 * classique sur l attribut `data-state` Radix est :
 *   - mount data-state=open : translate-x = 0 (default), visible immediatement
 *   - close data-state=closed : translate-x = -100% (left) ou +100% (right)
 *     avec transition-transform duration-200 -> glisse hors ecran propre
 * Pareil pour l overlay : transition-opacity au lieu de fade-in/out keyframe.
 */

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // P6.x-BURGER-FIX-bis : on force EXPLICITEMENT opacity-100 a l etat open
        // (et pas seulement defaut) + opacity-0 a l etat closed. Defensif contre
        // tout merge tailwind-merge / classe upstream qui ecraserait l opacite.
        'fixed inset-0 z-50 bg-black/30 transition-opacity duration-150',
        'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

interface SheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /** Cote d'apparition du drawer. Defaut: left (menu mobile). */
  side?: 'left' | 'right';
}

function SheetContent({ className, children, side = 'left', ...props }: SheetContentProps) {
  // P6.x-BURGER-FIX-bis : on force EXPLICITEMENT translate-x-0 a data-state=open
  // (au lieu de relier sur la valeur "default" du transform). Defensif contre
  // les cas ou une autre classe set transform via cn() / tailwind-merge, ou
  // contre un residu --tw-enter-translate-x propage par Radix Presence entre
  // 2 frames sur mobile Safari.
  const sideClasses =
    side === 'left'
      ? 'inset-y-0 left-0 h-full w-72 border-r data-[state=open]:translate-x-0 data-[state=closed]:-translate-x-full'
      : 'inset-y-0 right-0 h-full w-72 border-l data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full';
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-background fixed z-50 flex flex-col transition-transform duration-200 ease-out outline-none',
          sideClasses,
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-semibold', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
