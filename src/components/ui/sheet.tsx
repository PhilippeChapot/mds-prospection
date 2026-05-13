'use client';

/**
 * P5.x.17 — primitive Sheet minimal (drawer lateral) construit sur
 * radix-ui Dialog. Reprend la meme API que shadcn/ui Sheet pour
 * permettre un swap futur si shadcn est installe (compatibilite).
 *
 * Utilise par le menu mobile de l'Espace Exposant (sidebar burger).
 * On garde la surface API a strict minimum : Root/Trigger/Content +
 * Title/Description (Title est requis par Radix pour l'a11y).
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
        'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/30 duration-150',
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
  const sideClasses =
    side === 'left'
      ? 'inset-y-0 left-0 h-full w-72 border-r data-open:slide-in-from-left data-closed:slide-out-to-left'
      : 'inset-y-0 right-0 h-full w-72 border-l data-open:slide-in-from-right data-closed:slide-out-to-right';
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-background data-open:animate-in data-closed:animate-out fixed z-50 flex flex-col duration-200 outline-none',
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
