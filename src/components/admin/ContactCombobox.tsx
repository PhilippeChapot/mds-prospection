'use client';

/**
 * P5.x.24 — combobox contact côté admin (réutilisable).
 *
 * Comportement :
 *   - Recherche serveur via `/api/admin/contacts/search?q=...&company_id=...`
 *   - Si `filterByCompanyId` fourni → résultats limités à cette société
 *   - Sinon → recherche globale par email/nom + retour de la société associée
 *   - Bouton "+ Nouveau contact" déclenche `onCreateNew` (le parent gère
 *     l'ouverture d'un formulaire inline ou la bascule en mode "saisie manuelle")
 *
 * Émet aussi des `<input type="hidden">` pour les form classiques :
 *   - `contact_id` (UUID ou vide)
 *   - `contact_mode` (existing | new)
 */

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Star } from 'lucide-react';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export type ContactOption = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  language: 'FR' | 'EN';
  company_id: string;
  company_name: string;
  company_primary_domain: string | null;
};

export function ContactCombobox({
  initial,
  filterByCompanyId,
  onSelect,
  onCreateNew,
  onModeChange,
  disabled,
  emitHiddenInputs = true,
}: {
  initial?: ContactOption | null;
  filterByCompanyId?: string | null;
  onSelect?: (contact: ContactOption | null) => void;
  onCreateNew?: () => void;
  onModeChange?: (mode: 'existing' | 'new') => void;
  disabled?: boolean;
  emitHiddenInputs?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ContactOption | null>(initial ?? null);
  const [mode, setMode] = useState<'existing' | 'new'>(initial ? 'existing' : 'existing');

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [results, setResults] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Note : pas de prefill effect ni de reset-on-company-change.
  // `initial` est stable au mount (issu du server render). Si la société
  // sélectionnée change et qu'on a déjà un contact d'une AUTRE société,
  // la UI peut afficher l'incohérence — l'utilisateur clic sur la
  // combobox pour reset. Reste consistant avec React Compiler.

  // Reset selected si filter change vers une société différente.
  // (Dérivation pure : on n'écrit pas le state dans l'effet, on le calcule.)
  const effectiveSelected =
    selected && filterByCompanyId && selected.company_id !== filterByCompanyId ? null : selected;

  // Fetch results when popover open OR query changes (debounced).
  // setState in effect : pattern fetch-with-loading légitime, on désactive
  // la règle React Compiler localement.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const url = new URL('/api/admin/contacts/search', window.location.origin);
    url.searchParams.set('q', debouncedQuery);
    if (filterByCompanyId) url.searchParams.set('company_id', filterByCompanyId);
    fetch(url.toString())
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setResults((data.contacts as ContactOption[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, filterByCompanyId]);

  const setSelection = (c: ContactOption) => {
    setSelected(c);
    setMode('existing');
    onModeChange?.('existing');
    onSelect?.(c);
    setOpen(false);
  };

  const setNew = () => {
    setSelected(null);
    setMode('new');
    onModeChange?.('new');
    onSelect?.(null);
    setOpen(false);
    onCreateNew?.();
  };

  const displayLabel = (() => {
    if (mode === 'new') return '+ Nouveau contact (saisie ci-dessous)';
    if (!effectiveSelected) {
      return filterByCompanyId
        ? 'Choisir un contact de cette société…'
        : 'Chercher un contact (email, nom)…';
    }
    const name = [effectiveSelected.first_name, effectiveSelected.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name ? `${name} — ${effectiveSelected.email}` : effectiveSelected.email;
  })();

  return (
    <>
      {emitHiddenInputs ? (
        <>
          <input type="hidden" name="contact_id" value={effectiveSelected?.id ?? ''} />
          <input type="hidden" name="contact_mode" value={mode} />
        </>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls="contact-combobox-list"
            aria-haspopup="listbox"
            disabled={disabled}
            className={cn(
              'border-md-border bg-card hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
              'focus-visible:ring-md-magenta/60 focus-visible:ring-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span
              className={cn(
                'truncate',
                !effectiveSelected && mode !== 'new' && 'text-md-text-muted',
              )}
            >
              {displayLabel}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
          sideOffset={4}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Email, prénom, nom…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList id="contact-combobox-list">
              {loading && results.length === 0 ? (
                <div className="text-md-text-muted flex items-center gap-2 px-3 py-4 text-xs">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Recherche…
                </div>
              ) : null}
              {!loading && results.length === 0 && query.length >= 2 ? (
                <CommandEmpty>Aucun contact trouvé.</CommandEmpty>
              ) : null}
              {!loading && results.length === 0 && query.length < 2 ? (
                <div className="text-md-text-muted px-3 py-4 text-xs">
                  Tape au moins 2 caractères…
                </div>
              ) : null}
              {results.length > 0 ? (
                <CommandGroup heading="Contacts">
                  {results.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
                    return (
                      <CommandItem key={c.id} value={c.id} onSelect={() => setSelection(c)}>
                        <Check
                          className={cn(
                            'size-4 shrink-0',
                            effectiveSelected?.id === c.id ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {name || c.email}
                            {c.is_primary ? (
                              <Star
                                className="text-md-blue ml-1 inline-block size-3"
                                aria-label="primary"
                              />
                            ) : null}
                          </span>
                          <span className="text-md-text-muted truncate text-[10px]">
                            {c.email}
                            {c.role ? ` · ${c.role}` : ''}
                            {!filterByCompanyId ? ` · ${c.company_name}` : ''}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {onCreateNew ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__new__"
                      onSelect={setNew}
                      className="text-md-magenta font-semibold"
                    >
                      <Plus className="size-4" aria-hidden />
                      Nouveau contact (saisie manuelle)
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
