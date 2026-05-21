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
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
        className="bg-card flex max-h-dvh w-72 flex-col overflow-y-auto p-0"
      >
        <SheetTitle className="sr-only">{t('sectionTitle')}</SheetTitle>
        <AffilieSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
