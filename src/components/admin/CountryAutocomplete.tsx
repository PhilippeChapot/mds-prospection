'use client';

/**
 * P15.4-bis — combobox pays (i18n-iso-countries + shadcn Command/Popover).
 *
 * `valueMode='code'` stocke l'ISO2 (ex: passeport) ; `valueMode='name'` stocke
 * le nom localisé (ex: pays société destinataire). Liste localisée FR/EN.
 */
import { useMemo, useState } from 'react';
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import frLocale from 'i18n-iso-countries/langs/fr.json';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

countries.registerLocale(enLocale as Parameters<typeof countries.registerLocale>[0]);
countries.registerLocale(frLocale as Parameters<typeof countries.registerLocale>[0]);

type Option = { code: string; name: string };

export function CountryAutocomplete({
  value,
  onChange,
  locale,
  valueMode = 'code',
  placeholder,
  id,
}: {
  /** Valeur stockée : ISO2 si valueMode='code', sinon nom localisé. */
  value: string;
  onChange: (stored: string) => void;
  locale: 'fr' | 'en';
  valueMode?: 'code' | 'name';
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo<Option[]>(() => {
    const names = countries.getNames(locale, { select: 'official' });
    return Object.entries(names)
      .map(([code, name]) => ({ code, name: name as string }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    if (valueMode === 'code') {
      return countries.getName(value, locale, { select: 'official' }) ?? value;
    }
    return value;
  }, [value, valueMode, locale]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className="border-md-border flex h-9 w-full items-center justify-between rounded-md border bg-white px-3 text-sm"
        >
          <span className={cn('truncate', !selectedLabel && 'text-md-text-muted')}>
            {selectedLabel || placeholder || '—'}
          </span>
          <ChevronsUpDown className="text-md-text-muted size-4 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder ?? '...'} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const stored = valueMode === 'code' ? opt.code : opt.name;
                return (
                  <CommandItem
                    key={opt.code}
                    value={`${opt.name} ${opt.code}`}
                    onSelect={() => {
                      onChange(stored);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('mr-2 size-4', value === stored ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                    {opt.name} <span className="text-md-text-muted ml-1 text-xs">({opt.code})</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
