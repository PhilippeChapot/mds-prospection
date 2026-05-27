'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ExposantSidebar } from './ExposantSidebar';
import type { ContactProfile } from '@/lib/espace-exposant/detect-profile';

/**
 * P5.x.17 — burger menu mobile pour l'Espace Exposant V1.3.
 *
 * Affiche un bouton burger qui ouvre un drawer lateral (Sheet) gauche
 * contenant la meme sidebar que sur desktop. Se ferme automatiquement
 * apres clic sur un item (via le callback onNavigate -> setOpen(false)).
 */
export function ExposantMobileMenu({ profile }: { profile: ContactProfile | null }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('espaceExposant.nav');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted text-md-text inline-flex items-center justify-center rounded-md p-2 transition"
          aria-label={t('openMenu')}
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="relative w-72 p-0">
        {/* SheetTitle requis par Radix pour l'a11y -- on le rend visuellement
            invisible (le titre est deja dans la sidebar) avec sr-only. */}
        <SheetTitle className="sr-only">{t('sectionTitle')}</SheetTitle>
        {/* P9.1-natif-mobile : croix de fermeture top-right (tap-target ≥ 44px). */}
        <SheetClose
          aria-label={t('closeMenu')}
          className="text-md-text-muted hover:bg-muted hover:text-md-text focus-visible:ring-md-magenta absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </SheetClose>
        <ExposantSidebar onNavigate={() => setOpen(false)} profile={profile} />
      </SheetContent>
    </Sheet>
  );
}
