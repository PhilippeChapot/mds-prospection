'use client';

import { Check, Calendar } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSeason } from './SeasonContext';

export function SeasonSwitcher() {
  const { activeSeason, allSeasons, setActiveSeason } = useSeason();

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5',
          'text-xs font-semibold text-white transition hover:bg-white/15',
          'focus-visible:ring-md-magenta/60 focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <Calendar className="size-3.5" aria-hidden />
        <span>{activeSeason.name_fr}</span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="text-md-text-muted px-2 pt-1.5 pb-1 text-[10px] font-bold tracking-widest uppercase">
          Saisons
        </div>

        <ul className="space-y-0.5">
          {allSeasons.map((season) => {
            const isActive = season.id === activeSeason.id;
            return (
              <li key={season.id}>
                <button
                  type="button"
                  onClick={() => setActiveSeason(season.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                    isActive ? 'bg-md-blue/10 text-md-blue' : 'hover:bg-muted',
                  )}
                >
                  <span className="font-medium">{season.name_fr}</span>
                  {isActive ? (
                    <Check className="text-md-blue size-4" aria-hidden />
                  ) : (
                    <span className="text-md-text-muted text-[10px] uppercase">
                      {season.status === 'archived' ? 'Archivee' : 'Active'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}

          <li>
            <div
              aria-disabled
              className="flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm opacity-50"
              title="Disponible en P5 (gestion saisons)"
            >
              <span className="font-medium">MDS 2027</span>
              <span className="text-md-text-muted text-[10px] uppercase">Planification</span>
            </div>
          </li>
        </ul>

        <div className="text-md-text-muted border-md-border mt-1.5 border-t px-2 py-2 text-[11px]">
          La gestion complete des saisons arrive en P5.
        </div>
      </PopoverContent>
    </Popover>
  );
}
