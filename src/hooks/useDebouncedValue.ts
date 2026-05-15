'use client';

/**
 * useDebouncedValue — retourne la valeur passée en argument après un délai
 * sans changement. Utilisé par les comboboxes pour éviter de spammer l'API
 * pendant que l'utilisateur tape.
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
