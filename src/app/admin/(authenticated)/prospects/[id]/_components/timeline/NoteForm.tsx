'use client';

/**
 * P14.3.ProspectTimelineDrawer — form de saisie note (sticky top du drawer).
 *
 * 'use client' : onSubmit + useTransition + Ctrl+Enter shortcut.
 *
 * UX :
 *   - Textarea auto-grow simple via rows + min-h.
 *   - Dropdown contact (optionnel) = contacts de la company du prospect.
 *   - Ctrl/Cmd+Enter = submit.
 */

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { createProspectNoteAction } from '@/lib/admin/prospects/notes-actions';
import type { ProspectContactLite } from '@/lib/admin/prospects/timeline-helpers';

type Props = {
  prospectId: string;
  contacts: ProspectContactLite[];
};

export function NoteForm({ prospectId, contacts }: Props) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [contactId, setContactId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea a l ouverture du drawer.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function submit() {
    if (!content.trim()) {
      setError('La note ne peut pas être vide.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createProspectNoteAction({
        prospect_id: prospectId,
        contact_id: contactId || null,
        content: content.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setContent('');
      setContactId('');
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter (Win/Linux) OR Cmd+Enter (Mac) = submit.
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
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ajouter une note… (Ctrl+Entrée pour envoyer)"
        rows={3}
        maxLength={10000}
        disabled={pending}
        className="border-md-border bg-card text-md-text focus:border-md-blue focus:ring-md-blue-light min-h-[72px] w-full resize-y rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:outline-none disabled:opacity-50"
      />
      <div className="flex items-center gap-2">
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          disabled={pending || contacts.length === 0}
          className="border-md-border bg-card text-md-text flex-1 rounded-md border px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Avec quel contact ? (optionnel)</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
              {c.role ? ` — ${c.role}` : ''}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || !content.trim()}
          className="bg-md-blue hover:bg-md-blue-dark inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Send className="size-3.5" aria-hidden />
          {pending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
