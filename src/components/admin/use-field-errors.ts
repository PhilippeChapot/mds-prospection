'use client';

import { useState } from 'react';

/**
 * Affiche les erreurs Zod retournees par le server action, avec possibilite
 * de les "clear" champ par champ quand l'utilisateur modifie l'input.
 *
 * Pattern React 19 : state derivee de prop, set-state pendant render
 * (officiellement supporte) plutot que useEffect.
 *
 * Usage :
 *   const { errors, clear } = useFieldErrors(state.fieldErrors);
 *   <Input name="email" onChange={() => clear('email')} />
 *   {errors.email ? <p>{errors.email}</p> : null}
 */
export function useFieldErrors(serverErrors: Record<string, string> | undefined) {
  const [seen, setSeen] = useState(serverErrors);
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(() => new Set());

  // Detecte un nouveau set d'erreurs serveur -> reset les cleared.
  if (seen !== serverErrors) {
    setSeen(serverErrors);
    setClearedKeys(new Set());
  }

  const errors: Record<string, string> = {};
  if (serverErrors) {
    for (const [k, v] of Object.entries(serverErrors)) {
      if (!clearedKeys.has(k)) errors[k] = v;
    }
  }

  function clear(key: string) {
    setClearedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  return { errors, clear };
}
