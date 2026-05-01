'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export type CompanyOption = {
  id: string;
  name: string;
  primary_domain: string | null;
};

/**
 * Combobox cote client : selection d'une societe existante OU "+ Creer nouvelle".
 * En cas de "Nouvelle", le champ hidden `company_id` reste vide et un autre
 * champ hidden `company_mode=new` indique au server action de basculer en
 * creation. Les champs nouvelle societe sont rendus en parallele par le parent.
 */
export function CompanyCombobox({
  options,
  initialId,
  initialName,
  onModeChange,
}: {
  options: CompanyOption[];
  initialId?: string;
  initialName?: string;
  onModeChange?: (mode: 'existing' | 'new') => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(initialId ?? '');
  const [selectedName, setSelectedName] = useState<string>(initialName ?? '');
  const [mode, setMode] = useState<'existing' | 'new'>(initialId ? 'existing' : 'existing');

  const setSelection = (id: string, name: string) => {
    setSelectedId(id);
    setSelectedName(name);
    setMode('existing');
    onModeChange?.('existing');
    setOpen(false);
  };

  const setNewMode = () => {
    setSelectedId('');
    setSelectedName('');
    setMode('new');
    onModeChange?.('new');
    setOpen(false);
  };

  return (
    <>
      <input type="hidden" name="company_id" value={selectedId} />
      <input type="hidden" name="company_mode" value={mode} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls="company-combobox-list"
            aria-haspopup="listbox"
            className={cn(
              'border-md-border bg-card hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
              'focus-visible:ring-md-magenta/60 focus-visible:ring-2 focus-visible:outline-none',
            )}
          >
            <span
              className={cn('truncate', !selectedName && mode !== 'new' && 'text-md-text-muted')}
            >
              {mode === 'new'
                ? '+ Nouvelle societe (saisie ci-dessous)'
                : selectedName || 'Choisir une societe…'}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
          sideOffset={4}
        >
          <Command>
            <CommandInput placeholder="Rechercher par nom ou domaine…" />
            <CommandList id="company-combobox-list">
              <CommandEmpty>Aucune societe trouvee.</CommandEmpty>
              <CommandGroup heading="Societes existantes">
                {options.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.primary_domain ?? ''}`}
                    onSelect={() => setSelection(c.id, c.name)}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0',
                        selectedId === c.id ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      {c.primary_domain ? (
                        <span className="text-md-text-muted truncate font-mono text-[10px]">
                          {c.primary_domain}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={setNewMode} className="text-md-magenta font-semibold">
                  <Plus className="size-4" aria-hidden />
                  Creer une nouvelle societe
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
