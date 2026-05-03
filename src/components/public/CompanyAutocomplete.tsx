'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Plus, Loader2, ChevronDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface CompanySuggestion {
  id: string;
  name: string;
}

interface CompanyAutocompleteProps {
  value: string;
  onChange: (next: { name: string; id: string | null }) => void;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  ariaLabelledBy?: string;
}

/**
 * Combobox avec :
 *   - typing libre (controlled value)
 *   - debounce 250ms -> GET /api/public/companies/search?q=
 *   - liste de suggestions (existing companies)
 *   - fallback "Creer la societe « X »" si pas de match exact
 *
 * Selection :
 *   - clic sur suggestion -> onChange({ name, id })
 *   - clic sur "Creer..." OU Enter sur input vide -> onChange({ name, id: null })
 */
export function CompanyAutocomplete({
  value,
  onChange,
  placeholder,
  required,
  invalid,
  ariaLabelledBy,
}: CompanyAutocompleteProps) {
  const t = useTranslations('signup.step1');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Source de verite : `value` controle par le parent (Controller field.value).
  // Pas d'etat local pour query -> evite la sync via useEffect.

  // Debounced fetch declenche sur changement de `value`.
  // Tous les setState sont a l'interieur du setTimeout (callback async),
  // jamais dans le body de l'effect -> respecte react-hooks/set-state-in-effect.
  // Si query.length < 2, on n'ouvre pas de fetch ; les suggestions stales
  // restent en memoire mais le rendu conditionnel ne les affiche pas.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/public/companies/search?q=${encodeURIComponent(trimmed)}`);
        if (cancelled) return;
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { results: CompanySuggestion[] };
        if (!cancelled) setSuggestions(data.results ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [value]);

  function selectSuggestion(suggestion: CompanySuggestion) {
    onChange({ name: suggestion.name, id: suggestion.id });
    setOpen(false);
    inputRef.current?.blur();
  }

  function selectNew() {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onChange({ name: trimmed, id: null });
    setOpen(false);
    inputRef.current?.blur();
  }

  const trimmed = value.trim();
  const hasExactMatch = suggestions.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = trimmed.length >= 2 && !hasExactMatch;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'border-md-border focus-within:border-md-blue focus-within:ring-md-blue/20 flex h-10 items-center gap-2 rounded-md border bg-white px-3 transition-colors focus-within:ring-2',
            invalid &&
              'border-destructive focus-within:border-destructive focus-within:ring-destructive/20',
          )}
        >
          <Building2 className="text-md-text-muted h-4 w-4 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${inputId}-listbox`}
            aria-required={required}
            aria-labelledby={ariaLabelledBy}
            value={value}
            onChange={(e) => {
              onChange({ name: e.target.value, id: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder ?? t('labelCompanyPlaceholder')}
            className="placeholder:text-md-text-muted/70 flex-1 bg-transparent text-sm outline-none"
            autoComplete="organization"
          />
          {loading ? (
            <Loader2 className="text-md-text-muted h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ChevronDown className="text-md-text-muted h-4 w-4" aria-hidden />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false} id={`${inputId}-listbox`}>
          <CommandList>
            {trimmed.length < 2 && (
              <CommandEmpty>
                <span className="text-md-text-muted text-xs">{t('labelCompanyPlaceholder')}</span>
              </CommandEmpty>
            )}
            {trimmed.length >= 2 && suggestions.length === 0 && !loading && (
              <CommandEmpty>
                <span className="text-md-text-muted text-xs">—</span>
              </CommandEmpty>
            )}
            {suggestions.length > 0 && (
              <CommandGroup>
                {suggestions.map((s) => (
                  <CommandItem key={s.id} value={s.id} onSelect={() => selectSuggestion(s)}>
                    <Building2 className="text-md-text-muted h-3.5 w-3.5" aria-hidden />
                    <span>{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreateOption && (
              <CommandGroup>
                <CommandItem value="__create__" onSelect={selectNew} className="text-md-magenta">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  <span>{t('labelCompanyCreate', { name: trimmed })}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
