'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

export type Season = {
  id: string;
  code: string;
  name_fr: string;
  is_active: boolean;
  status: 'planning' | 'active' | 'archived';
};

type SeasonContextValue = {
  activeSeason: Season;
  allSeasons: Season[];
  setActiveSeason: (id: string) => void;
};

const SeasonContext = createContext<SeasonContextValue | null>(null);

const STORAGE_KEY = 'mds.activeSeasonId';

const subscribeStorage = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

/**
 * useSyncExternalStore = pattern officiel React 19 pour lire un store externe
 * (localStorage) en evitant les hydration mismatches. Le serveur retourne
 * `initialActiveId` ; le client lit localStorage post-hydratation.
 */
function useStoredActiveId(initialActiveId: string, validIds: string[]): string {
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  if (stored && validIds.includes(stored)) return stored;
  return initialActiveId;
}

export function SeasonProvider({
  initialSeasons,
  initialActiveId,
  children,
}: {
  initialSeasons: Season[];
  initialActiveId: string;
  children: React.ReactNode;
}) {
  const validIds = useMemo(() => initialSeasons.map((s) => s.id), [initialSeasons]);
  const storedId = useStoredActiveId(initialActiveId, validIds);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const activeId = overrideId ?? storedId;

  const setActiveSeason = useCallback((id: string) => {
    setOverrideId(id);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // localStorage peut etre desactive (Safari private). Fallback silencieux.
      }
    }
  }, []);

  const value = useMemo<SeasonContextValue>(() => {
    const active =
      initialSeasons.find((s) => s.id === activeId) ??
      initialSeasons.find((s) => s.is_active) ??
      initialSeasons[0];
    return {
      activeSeason: active,
      allSeasons: initialSeasons,
      setActiveSeason,
    };
  }, [activeId, initialSeasons, setActiveSeason]);

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) {
    throw new Error('useSeason must be used inside <SeasonProvider>');
  }
  return ctx;
}
