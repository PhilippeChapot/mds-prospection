'use client';

/**
 * P14.3-bis.NotesLegacyMerge — quick-note form inline sur la fiche prospect.
 *
 * 'use client' : onSubmit + onClick + useTransition.
 *
 * Cas d usage :
 *   - L admin tape une note rapide directement depuis la fiche prospect
 *     (sans avoir a ouvrir le drawer Timeline).
 *   - Pour reviewer l historique complet, click "Voir l'historique" →
 *     ouvre le drawer (state partage via ProspectMainSection).
 *
 * Note : reutilise createProspectNoteAction (meme server action que le
 * form inside drawer). DRY.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, History } from 'lucide-react';
import { createProspectNoteAction } from '@/lib/admin/prospects/notes-actions';

type Props = {
  prospectId: string;
  noteCount: number;
  onOpenDrawer: () => void;
};

export function ProspectQuickNoteForm({ prospectId, noteCount, onOpenDrawer }: Props) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createProspectNoteAction({
        prospect_id: prospectId,
        contact_id: null,
        content: content.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setContent('');
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Note rapide… (Ctrl+Entrée pour envoyer)"
        rows={2}
        maxLength={10000}
        disabled={pending}
        className="border-md-border bg-card text-md-text focus:border-md-blue focus:ring-md-blue-light w-full resize-y rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="text-md-blue hover:text-md-blue-dark inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
        >
          <History className="size-3.5" aria-hidden />
          Voir l&apos;historique
          {noteCount > 0 ? (
            <span className="bg-md-blue-light text-md-blue-dark rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {noteCount}
            </span>
          ) : null}
        </button>
        <button
          type="submit"
          disabled={pending || !content.trim()}
          className="bg-md-blue hover:bg-md-blue-dark inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Send className="size-3.5" aria-hidden />
          {pending ? 'Envoi…' : 'Ajouter une note'}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
