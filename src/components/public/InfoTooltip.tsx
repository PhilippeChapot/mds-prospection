'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Bulle info ⓘ accessible :
 *   - Mobile : ouverture au clic.
 *   - Desktop : ouverture au survol ET au clic (toggle force par le state).
 *   - Clavier : focus + Enter/Space ouvre, Escape ferme (gere par Radix).
 *
 * Usage :
 *   <InfoTooltip aria-label="Pourquoi un email pro ?">
 *     <p>Texte explicatif...</p>
 *   </InfoTooltip>
 */
export function InfoTooltip({
  ariaLabel,
  children,
  className,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          className={cn(
            'text-md-text-muted hover:text-md-blue focus-visible:ring-md-blue inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
            className,
          )}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="text-md-text max-w-sm text-xs leading-relaxed"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
