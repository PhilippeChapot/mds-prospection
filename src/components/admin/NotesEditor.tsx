'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Editeur de notes inline avec debounce 500ms.
 * Generique : on lui passe l'action serveur a appeler (entityId, notes) -> Promise<void>.
 */
export function NotesEditor({
  entityId,
  initialNotes,
  action,
  placeholder,
  rows = 5,
  maxLength = 4000,
}: {
  entityId: string;
  initialNotes: string;
  action: (entityId: string, notes: string) => Promise<void>;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const [value, setValue] = useState(initialNotes);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [, startTransition] = useTransition();
  const lastSavedRef = useRef<string>(initialNotes);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState('saving');
    timerRef.current = setTimeout(() => {
      if (next === lastSavedRef.current) {
        setSaveState('saved');
        return;
      }
      startTransition(async () => {
        try {
          await action(entityId, next);
          lastSavedRef.current = next;
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      });
    }, 500);
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        rows={rows}
        placeholder={placeholder ?? 'Contexte, prochaine action, points cles…'}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleSave(e.target.value);
        }}
      />
      <div className="text-md-text-muted flex items-center gap-1.5 text-[11px]">
        {saveState === 'saving' && (
          <>
            <Loader2 className="size-3 animate-spin" aria-hidden />
            <span>Enregistrement…</span>
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Check className="text-md-success size-3" aria-hidden />
            <span>Enregistre</span>
          </>
        )}
        {saveState === 'error' && (
          <span className="text-md-danger">Erreur de sauvegarde — reessayez.</span>
        )}
        <span className={cn('ml-auto', value.length > maxLength * 0.9 && 'text-md-warning')}>
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
