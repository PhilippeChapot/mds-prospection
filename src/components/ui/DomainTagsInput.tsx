'use client';

/**
 * P5.x.23-quater — composant de saisie multi-domaines réutilisable.
 *
 * UX :
 *   - Input texte avec normalisation auto à l'ajout (strip protocole, www., trailing slash)
 *   - Entrée / virgule / espace → valide + ajoute
 *   - Backspace sur input vide → retire le dernier tag
 *   - Bouton X par tag pour suppression individuelle
 *   - Validation regex domaine basique (pas de check DNS)
 *   - Dédup automatique (case-insensitive via lowercase)
 *
 * Utilisé par :
 *   - /admin/companies/[id]/edit (formulaire édition société)
 *   - /admin/contacts/quick-add (Smart Add étape 2)
 *
 * Pour le form classique (useActionState/FormData) : passer `name` pour
 * émettre un hidden input JSON-stringifié.
 */

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { normalizeDomain, isValidDomain } from '@/lib/utils/domain';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  /** Si défini, émet un <input type="hidden" name={name} value={JSON.stringify(value)} /> */
  name?: string;
  placeholder?: string;
  /** Empêche d'ajouter ces domaines (typiquement le primary_domain). */
  excludeDomains?: string[];
  /** Désactive l'input (mais conserve l'affichage). */
  disabled?: boolean;
}

export function DomainTagsInput({
  value,
  onChange,
  name,
  placeholder = 'Ajouter un domaine (Entrée pour valider)',
  excludeDomains = [],
  disabled = false,
}: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function addDomain() {
    const normalized = normalizeDomain(draft);
    setError(null);
    if (!normalized) return;
    if (!isValidDomain(normalized)) {
      setError(`Domaine invalide : ${normalized}`);
      return;
    }
    if (value.includes(normalized)) {
      setError(`Déjà présent : ${normalized}`);
      return;
    }
    if (excludeDomains.map((d) => d.toLowerCase()).includes(normalized)) {
      setError(`Identique au domaine principal : ${normalized}`);
      return;
    }
    onChange([...value, normalized]);
    setDraft('');
  }

  function removeDomain(d: string) {
    if (disabled) return;
    onChange(value.filter((x) => x !== d));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addDomain();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <div
        className={`border-md-border focus-within:ring-md-blue/30 flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border bg-white p-1.5 focus-within:ring-2 ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        {value.map((d) => (
          <span
            key={d}
            className="bg-md-blue/10 text-md-blue inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs"
          >
            {d}
            {!disabled ? (
              <button
                type="button"
                onClick={() => removeDomain(d)}
                className="hover:bg-md-blue/20 rounded p-0.5"
                aria-label={`Retirer ${d}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKey}
          onBlur={() => {
            if (draft) addDomain();
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="text-md-text min-w-[120px] flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error ? <p className="text-md-danger mt-1 text-xs">{error}</p> : null}
      {name ? <input type="hidden" name={name} value={JSON.stringify(value)} /> : null}
    </div>
  );
}
