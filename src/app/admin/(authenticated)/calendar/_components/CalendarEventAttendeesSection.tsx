'use client';

/**
 * P14.2 #9 — section "Invités" dans CalendarEventFormModal.
 *
 * Affiche la liste des invités courants + autocomplete MDS contacts +
 * saisie email externe. Appelle searchContactsForCalendarAction (debounced)
 * pour les suggestions.
 *
 * Props :
 *   attendees   : AttendeeRecord[] courants
 *   onChange    : callback quand la liste change
 *   prospectId  : pour prioriser les contacts de la company liée
 *   locale      : 'fr' | 'en'
 */

import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AttendeeRecord } from '@/lib/admin/calendar/helpers';
import {
  searchContactsForCalendarAction,
  type ContactSuggestion,
} from '@/lib/admin/calendar/actions';

interface Props {
  attendees: AttendeeRecord[];
  onChange: (attendees: AttendeeRecord[]) => void;
  prospectId?: string | null;
  locale?: 'fr' | 'en';
}

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  accepted: '✅',
  declined: '❌',
  tentative: '❓',
  needsAction: '⏳',
};

const COPY = {
  fr: {
    label: 'Invités',
    placeholder: 'Rechercher un contact ou saisir un email…',
    add: 'Ajouter',
    noResults: 'Aucun contact trouvé',
    companyBadge: '★ Société',
    emailHint: 'Appuyer sur Entrée ou "Ajouter" pour inviter cet email',
    maxReached: 'Maximum 50 invités',
  },
  en: {
    label: 'Attendees',
    placeholder: 'Search a contact or type an email…',
    add: 'Add',
    noResults: 'No contacts found',
    companyBadge: '★ Company',
    emailHint: 'Press Enter or "Add" to invite this email',
    maxReached: 'Maximum 50 attendees',
  },
} as const;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function CalendarEventAttendeesSection({
  attendees,
  onChange,
  prospectId,
  locale = 'fr',
}: Props) {
  const c = COPY[locale];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingEmails = new Set(attendees.map((a) => a.email.toLowerCase()));

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      // Si query vide et prospect_id : montre les contacts company sans filtrage.
      if (prospectId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        searchContactsForCalendarAction({
          query: '',
          prospect_id: prospectId,
          exclude_emails: Array.from(existingEmails),
        })
          .then((r) => {
            if (r.ok) setResults(r.data);
          })
          .finally(() => setLoading(false));
      } else {
        setResults([]);
        setShowDropdown(false);
      }
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchContactsForCalendarAction({
        query: query.trim(),
        prospect_id: prospectId,
        exclude_emails: Array.from(existingEmails),
      })
        .then((r) => {
          if (r.ok) {
            setResults(r.data);
            setShowDropdown(true);
          }
        })
        .finally(() => setLoading(false));
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, prospectId]);

  function addAttendee(a: AttendeeRecord) {
    if (attendees.length >= 50) return;
    if (existingEmails.has(a.email.toLowerCase())) return;
    onChange([...attendees, a]);
    setQuery('');
    setShowDropdown(false);
    setResults([]);
    inputRef.current?.focus();
  }

  function handleSelectSuggestion(s: ContactSuggestion) {
    addAttendee({
      email: s.email,
      displayName: s.displayName !== s.email ? s.displayName : null,
      contact_id: s.id,
      responseStatus: 'needsAction',
    });
  }

  function handleAddExternal() {
    const email = query.trim();
    if (!isValidEmail(email)) return;
    addAttendee({ email, displayName: null, contact_id: null, responseStatus: 'needsAction' });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isValidEmail(query.trim())) {
        handleAddExternal();
      }
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  function removeAttendee(email: string) {
    onChange(attendees.filter((a) => a.email !== email));
  }

  const canAddExternal =
    isValidEmail(query.trim()) && !existingEmails.has(query.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-inherit">{c.label}</label>

      {/* Liste des invités courants */}
      {attendees.length > 0 && (
        <ul className="space-y-1">
          {attendees.map((a) => (
            <li
              key={a.email}
              className="border-md-border flex items-center justify-between gap-2 rounded-md border bg-white px-2 py-1 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{a.displayName ?? a.email}</span>
                {a.displayName && a.displayName !== a.email && (
                  <span className="text-md-text-muted ml-1">({a.email})</span>
                )}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.responseStatus && a.responseStatus !== 'needsAction' && (
                  <span title={a.responseStatus}>
                    {RESPONSE_STATUS_LABELS[a.responseStatus] ?? ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttendee(a.email)}
                  className="text-md-text-muted hover:text-red-600"
                  aria-label={`Retirer ${a.email}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Input + suggestions */}
      {attendees.length < 50 && (
        <div className="relative">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder={c.placeholder}
                className="h-8 text-xs"
                autoComplete="off"
              />
              {loading && (
                <Loader2 className="text-md-text-muted absolute top-1/2 right-2 size-3 -translate-y-1/2 animate-spin" />
              )}
            </div>
            {canAddExternal && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExternal}
                className="h-8 px-2"
              >
                <UserPlus className="size-3" />
              </Button>
            )}
          </div>

          {/* Dropdown suggestions */}
          {showDropdown && results.length > 0 && (
            <ul className="border-md-border absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
              {results.map((s) => (
                <li key={s.id ?? s.email}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(s);
                    }}
                    className="hover:bg-md-blue-light flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.displayName}</span>
                      {s.displayName !== s.email && (
                        <span className="text-md-text-muted block truncate">{s.email}</span>
                      )}
                    </span>
                    {s.isCompanyContact && (
                      <span className="bg-md-blue-light text-md-blue-dark shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold">
                        {c.companyBadge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showDropdown &&
            !loading &&
            query.trim().length >= 2 &&
            results.length === 0 &&
            !canAddExternal && (
              <div className="border-md-border absolute z-50 mt-1 w-full rounded-md border bg-white px-3 py-2 text-xs text-gray-400 shadow-lg">
                {c.noResults}
              </div>
            )}

          {canAddExternal && <p className="text-md-text-muted mt-0.5 text-[10px]">{c.emailHint}</p>}
        </div>
      )}

      {attendees.length >= 50 && <p className="text-[10px] text-amber-600">{c.maxReached}</p>}
    </div>
  );
}
