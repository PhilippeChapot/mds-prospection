'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AdminSidebar } from './AdminSidebar';

/**
 * P6.x-mobile-burger — bouton burger admin (mobile uniquement).
 *
 * Rend un trigger en haut a gauche de l'AdminTopbar (`md:hidden`) qui ouvre
 * un Sheet lateral contenant la meme AdminSidebar que sur desktop. Apres un
 * clic sur un item, `onNavigate` rappelle `setOpen(false)` pour fermer
 * automatiquement le drawer (sinon l'utilisateur reste bloque sur la liste).
 *
 * Inspire d'`ExposantMobileMenu` (P5.x.17) pour la coherence du shell mobile.
 */
export function AdminMobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-white transition hover:bg-white/10 md:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-card w-72 p-0">
        {/* SheetTitle requis par Radix pour l'a11y. */}
        <SheetTitle className="sr-only">Navigation admin</SheetTitle>
        <AdminSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
