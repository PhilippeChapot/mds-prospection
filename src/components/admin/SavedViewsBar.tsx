'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'mds.savedViews.prospects.v1';

export type SavedView = {
  id: string;
  name: string;
  queryString: string;
};

function defaultViews(currentUserId: string): SavedView[] {
  const ownerParam = currentUserId ? `&owner=${currentUserId}` : '';
  return [
    { id: 'seed-mes-signes', name: 'Mes signes', queryString: `status=signe${ownerParam}` },
    {
      id: 'seed-a-relancer',
      name: 'A relancer (devis envoyes)',
      queryString: 'status=devis_envoye',
    },
    { id: 'seed-pole-audio', name: 'Pole Audio', queryString: 'pole=AUDIO_RADIO' },
  ];
}

const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};

function readStorage(): SavedView[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedView[];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (v): v is SavedView =>
        typeof v?.id === 'string' &&
        typeof v?.name === 'string' &&
        typeof v?.queryString === 'string',
    );
  } catch {
    return null;
  }
}

function writeStorage(views: SavedView[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    // Force le re-render des autres useSyncExternalStore dans cet onglet.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  } catch {
    // ignore
  }
}

function useStoredViews(currentUserId: string): SavedView[] {
  const seeds = defaultViews(currentUserId);
  const stored = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(STORAGE_KEY),
    () => null,
  );
  if (stored === null) {
    return seeds;
  }
  try {
    const parsed = JSON.parse(stored) as SavedView[];
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (v): v is SavedView =>
          typeof v?.id === 'string' &&
          typeof v?.name === 'string' &&
          typeof v?.queryString === 'string',
      );
    }
  } catch {
    // ignore
  }
  return seeds;
}

export function SavedViewsBar({ currentUserId }: { currentUserId: string }) {
  const views = useStoredViews(currentUserId);
  const searchParams = useSearchParams();
  const currentQueryString = searchParams.toString();
  const hasActiveFilters = currentQueryString.length > 0 && !currentQueryString.startsWith('page=');

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  function saveCurrentView() {
    if (!name.trim()) return;
    const existing = readStorage() ?? [];
    const newView: SavedView = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `v-${Date.now()}`,
      name: name.trim().slice(0, 50),
      queryString: currentQueryString,
    };
    writeStorage([...existing, newView]);
    setName('');
    setSaveOpen(false);
  }

  function deleteView(id: string) {
    if (id.startsWith('seed-')) {
      // Permet de "masquer" les seeds en les copiant en storage sans cet id.
      const others = views.filter((v) => v.id !== id);
      writeStorage(others);
      return;
    }
    const existing = readStorage();
    if (!existing) return;
    writeStorage(existing.filter((v) => v.id !== id));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
        Mes vues
      </span>
      {views.length === 0 ? (
        <span className="text-md-text-muted text-xs italic">Aucune vue sauvegardee</span>
      ) : (
        views.map((v) => <ViewChip key={v.id} view={v} onDelete={() => deleteView(v.id)} />)
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasActiveFilters}
            title={!hasActiveFilters ? 'Applique d’abord un filtre' : 'Sauvegarder cette vue'}
          >
            <BookmarkPlus className="size-3.5" aria-hidden />
            Sauvegarder
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sauvegarder cette vue</DialogTitle>
            <DialogDescription>
              Enregistre les filtres courants sous un nom. Stockage local, pas synchro entre
              appareils.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Mes signes Audio"
              maxLength={50}
              autoFocus
            />
            <p className="text-md-text-muted font-mono text-[11px]">?{currentQueryString}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button onClick={saveCurrentView} disabled={!name.trim()}>
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewChip({ view, onDelete }: { view: SavedView; onDelete: () => void }) {
  const searchParams = useSearchParams();
  const isActive = searchParams.toString() === view.queryString;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition',
        isActive
          ? 'border-md-magenta/40 bg-md-magenta/10 text-md-magenta'
          : 'border-md-border bg-white',
      )}
    >
      <Link href={`/admin/prospects?${view.queryString}`} className="hover:underline">
        {view.name}
      </Link>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Supprimer la vue ${view.name}`}
        className="text-md-text-muted hover:text-md-danger transition"
        title="Supprimer cette vue"
      >
        <Trash2 className="size-3" aria-hidden />
      </button>
    </span>
  );
}
