'use client';

/**
 * P6.x.4-a-decies — bouton CTA Bruxelles qui ouvre la modale form de
 * contact (LandingContactForm) au lieu du mailto historique.
 *
 * Petit composant client isole pour laisser EtapesSection en server
 * component pur. Le provider <InstitutionnelEcoleFormProvider> est
 * monte au niveau de la page (cf. src/app/[locale]/(public)/page.tsx).
 */

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useInstitutionnelEcoleForm } from './institutionnel-ecole-form-context';

export function BruxellesCtaButton({
  label,
  ariaLabel,
  className,
}: {
  label: string;
  ariaLabel: string;
  className?: string;
}) {
  const { openForm } = useInstitutionnelEcoleForm();
  return (
    <Button
      type="button"
      onClick={() => openForm('bruxelles')}
      aria-label={ariaLabel}
      className={cn('w-full', className)}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </Button>
  );
}
