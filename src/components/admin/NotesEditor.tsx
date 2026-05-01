'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { updateProspectNotesAction } from '@/app/admin/(authenticated)/prospects/[id]/actions';
import { cn } from '@/lib/utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function NotesEditor({
  prospectId,
  initialNotes,
}: {
  prospectId: string;
  initialNotes: string;
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
          await updateProspectNotesAction(prospectId, next);
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
        rows={5}
        placeholder="Contexte, prochaine action, points cles…"
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
        <span className={cn('ml-auto', value.length > 3500 && 'text-md-warning')}>
          {value.length} / 4000
        </span>
      </div>
    </div>
  );
}
