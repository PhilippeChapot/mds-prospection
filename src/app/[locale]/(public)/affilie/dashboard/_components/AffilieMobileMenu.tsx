'use client';

/**
 * P7.x.1.B — burger menu mobile Espace Affilie.
 *
 * Mirror direct d'ExposantMobileMenu (P5.x.17) + AdminMobileMenu (P6.x).
 * SheetContent passe en flex-col + overflow-y-auto + max-h-dvh pour
 * permettre le scroll quand le contenu depasse la viewport mobile
 * (cf. fix P6.x.3-bis admin burger).
 */

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AffilieSidebar } from './AffilieSidebar';

export function AffilieMobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('espaceAffilie.nav');

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
      <SheetContent
        side="left"
        // P6.x-BURGER-FIX-ter : NE PAS ajouter `relative` ici (tailwind-merge
        // ecrase `fixed` du SheetContent primitive -> invisible).
        className="bg-card flex max-h-dvh w-72 flex-col overflow-y-auto p-0"
      >
        <SheetTitle className="sr-only">{t('sectionTitle')}</SheetTitle>
        {/* P9.1-natif-mobile : croix de fermeture top-right (tap-target ≥ 44px). */}
        <SheetClose
          aria-label={t('closeMenu')}
          className="text-md-text-muted hover:bg-muted hover:text-md-text focus-visible:ring-md-magenta absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden />
        </SheetClose>
        <AffilieSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
