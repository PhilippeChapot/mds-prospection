'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AdminSidebar } from './AdminSidebar';
import type { UserRole } from '@/lib/supabase/auth-helpers';

/**
 * P6.x-mobile-burger — bouton burger admin (mobile uniquement).
 *
 * Rend un trigger en haut a gauche de l'AdminTopbar (`md:hidden`) qui ouvre
 * un Sheet lateral contenant la meme AdminSidebar que sur desktop. Apres un
 * clic sur un item, `onNavigate` rappelle `setOpen(false)` pour fermer
 * automatiquement le drawer (sinon l'utilisateur reste bloque sur la liste).
 *
 * P5.x.1-quater (bug #2) : `currentUserRole` est forward a la sidebar pour
 * filtrer les items selon le role (Sales voit moins d'items).
 *
 * Inspire d'`PartenaireMobileMenu` (P5.x.17) pour la coherence du shell mobile.
 */
export function AdminMobileMenu({ currentUserRole }: { currentUserRole: UserRole }) {
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
      {/* P6.x.3-bis : flex column + overflow-y-auto pour que la sidebar
          puisse scroller quand son contenu depasse la viewport mobile
          (5 sections + 15+ entrees + bouton "Nouveau devis" ne tiennent
          pas en 667px iPhone SE). */}
      <SheetContent
        side="left"
        // P6.x-BURGER-FIX-ter : NE PAS ajouter `relative` ici. Le SheetContent
        // primitive est `position: fixed` (cf src/components/ui/sheet.tsx) et
        // tailwind-merge ferait gagner `relative` -> SheetContent perdrait son
        // positioning fixed inset-y-0 left-0 -> invisible. `fixed` cree deja un
        // containing block pour les enfants `absolute` (ex: SheetClose).
        className="bg-card flex max-h-dvh w-72 flex-col overflow-y-auto p-0"
      >
        {/* SheetTitle requis par Radix pour l'a11y. */}
        <SheetTitle className="sr-only">Navigation admin</SheetTitle>
        {/* P9.1-natif-mobile : croix de fermeture top-right (tap-target ≥ 44px).
            Sans elle, l'utilisateur n'a que l'overlay-click (peu intuitif). */}
        <SheetClose
          aria-label="Fermer le menu"
          className="text-md-text-muted hover:bg-muted hover:text-md-text focus-visible:ring-md-magenta absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </SheetClose>
        <AdminSidebar onNavigate={() => setOpen(false)} currentUserRole={currentUserRole} />
      </SheetContent>
    </Sheet>
  );
}
