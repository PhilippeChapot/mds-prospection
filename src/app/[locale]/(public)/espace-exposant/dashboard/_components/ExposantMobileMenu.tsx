'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ExposantSidebar } from './ExposantSidebar';

/**
 * P5.x.17 — burger menu mobile pour l'Espace Exposant V1.3.
 *
 * Affiche un bouton burger qui ouvre un drawer lateral (Sheet) gauche
 * contenant la meme sidebar que sur desktop. Se ferme automatiquement
 * apres clic sur un item (via le callback onNavigate -> setOpen(false)).
 */
export function ExposantMobileMenu() {
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
      <SheetContent side="left" className="w-72 p-0">
        {/* SheetTitle requis par Radix pour l'a11y -- on le rend visuellement
            invisible (le titre est deja dans la sidebar) avec sr-only. */}
        <SheetTitle className="sr-only">{t('sectionTitle')}</SheetTitle>
        <ExposantSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
