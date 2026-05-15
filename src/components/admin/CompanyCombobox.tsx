'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
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

export type CompanyOption = {
  id: string;
  name: string;
  primary_domain: string | null;
};

/**
 * P5.x.24 — combobox société côté admin avec recherche serveur.
 *
 * Source des candidats : route `/api/admin/companies/search?q=...` qui filtre
 * via GIN trgm (ilike) puis ranke en JS (startsWith=100, contains=50,
 * domain=30, fuzzy=10) avec tie-breaker alphabétique. Fix le bug "ALGAM"
 * où cmdk fuzzy default mettait LAGARDERE en premier.
 *
 * Le composant garde la sémantique formData :
 *   - <input type="hidden" name="company_id">
 *   - <input type="hidden" name="company_mode" value="existing|new">
 *
 * Compat : prend toujours `initialId`/`initialName` pour le prefill via
 * query param (ex: `/admin/prospects/new?contact_id=X` pré-remplit).
 */
export function CompanyCombobox({
  initialId,
  initialName,
  onModeChange,
  onSelect,
  disabled,
}: {
  initialId?: string;
  initialName?: string;
  onModeChange?: (mode: 'existing' | 'new') => void;
  /** Optionnel : notifie le parent du company sélectionné (utile pour le ContactCombobox filtré). */
  onSelect?: (company: CompanyOption | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(initialId ?? '');
  const [selectedName, setSelectedName] = useState<string>(initialName ?? '');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Note : pas de prefill effect — initialId/initialName sont des props
  // stables au mount (issues du server render). Le parent ne les modifie
  // pas après mount ; toute selection ultérieure passe par les handlers
  // internes.

  // Fetch results when popover open OR query changes (debounced).
  // setState in effect est nécessaire ici (spinner pendant fetch) — pattern
  // pleinement légitime ; on désactive la règle React Compiler.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const url = new URL('/api/admin/companies/search', window.location.origin);
    url.searchParams.set('q', debouncedQuery);
    fetch(url.toString())
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setResults((data.companies as CompanyOption[]) ?? []);
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
  }, [open, debouncedQuery]);

  const setSelection = (c: CompanyOption) => {
    setSelectedId(c.id);
    setSelectedName(c.name);
    setMode('existing');
    onModeChange?.('existing');
    onSelect?.(c);
    setOpen(false);
  };

  const setNewMode = () => {
    setSelectedId('');
    setSelectedName('');
    setMode('new');
    onModeChange?.('new');
    onSelect?.(null);
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
            disabled={disabled}
            className={cn(
              'border-md-border bg-card hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition',
              'focus-visible:ring-md-magenta/60 focus-visible:ring-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-60',
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
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher par nom ou domaine…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList id="company-combobox-list">
              {loading && results.length === 0 ? (
                <div className="text-md-text-muted flex items-center gap-2 px-3 py-4 text-xs">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Recherche…
                </div>
              ) : null}
              {!loading && results.length === 0 ? (
                <CommandEmpty>Aucune societe trouvee.</CommandEmpty>
              ) : null}
              {results.length > 0 ? (
                <CommandGroup heading="Societes existantes">
                  {results.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => setSelection(c)}>
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
              ) : null}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__new__"
                  onSelect={setNewMode}
                  className="text-md-magenta font-semibold"
                >
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
