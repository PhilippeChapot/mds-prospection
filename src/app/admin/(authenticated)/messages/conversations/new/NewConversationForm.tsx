'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createConversationAction,
  searchContactsForNewConversationAction,
} from '@/lib/internal-messaging/actions';

type StaffOption = { id: string; full_name: string | null; email: string; role: string };
type ContactOption = { id: string; email: string; full_name: string; company_name: string | null };

/**
 * P9.2 — formulaire creation conversation interne cote admin.
 *
 * 2 modes : staff_dm (selecteur user) ou support (recherche contact).
 * Submit -> createConversationAction -> redirect vers /admin/messages/
 * conversations/[id].
 */
export function NewConversationForm({ staffOptions }: { staffOptions: StaffOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'staff_dm' | 'support'>('staff_dm');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [recipientContactId, setRecipientContactId] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  function runSearch(q: string) {
    setContactQuery(q);
    if (q.trim().length < 2) {
      setContactResults([]);
      return;
    }
    startSearch(async () => {
      const results = await searchContactsForNewConversationAction({ query: q });
      setContactResults(results);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (message.trim().length < 1) {
      setError('Message vide.');
      return;
    }
    if (mode === 'staff_dm' && !recipientUserId) {
      setError('Choisissez un collègue.');
      return;
    }
    if (mode === 'support' && !recipientContactId) {
      setError('Choisissez un contact partenaire.');
      return;
    }

    startTransition(async () => {
      const r = await createConversationAction({
        type: mode,
        recipient_type: mode === 'staff_dm' ? 'user' : 'contact',
        recipient_id: mode === 'staff_dm' ? recipientUserId : recipientContactId,
        subject: subject.trim() || undefined,
        initial_message: message.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success('Conversation créée');
      router.push(`/admin/messages/conversations/${r.conversation_id}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-md-border bg-card space-y-4 rounded-xl border p-5 shadow-sm"
    >
      <div className="space-y-1.5">
        <Label>Type de conversation</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('staff_dm')}
            className={
              mode === 'staff_dm'
                ? 'bg-md-blue border-md-blue rounded-md border px-3 py-1.5 text-sm font-semibold text-white'
                : 'border-md-border text-md-text hover:bg-muted rounded-md border px-3 py-1.5 text-sm'
            }
          >
            👥 Message à un collègue (DM staff)
          </button>
          <button
            type="button"
            onClick={() => setMode('support')}
            className={
              mode === 'support'
                ? 'bg-md-magenta border-md-magenta rounded-md border px-3 py-1.5 text-sm font-semibold text-white'
                : 'border-md-border text-md-text hover:bg-muted rounded-md border px-3 py-1.5 text-sm'
            }
          >
            💬 Message à un partenaire (support)
          </button>
        </div>
      </div>

      {mode === 'staff_dm' ? (
        <div className="space-y-1.5">
          <Label htmlFor="nc-user">Destinataire (collègue)</Label>
          <select
            id="nc-user"
            value={recipientUserId}
            onChange={(e) => setRecipientUserId(e.target.value)}
            className="border-md-border h-9 w-full rounded-md border bg-white px-2 text-sm"
            required
          >
            <option value="">— Choisir un collègue —</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name?.trim() || s.email} · {s.role}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Destinataire (contact partenaire)</Label>
          <div className="relative">
            <Search className="text-md-text-muted absolute top-2.5 left-2 size-4" aria-hidden />
            <Input
              placeholder="Rechercher par nom / email..."
              value={contactQuery}
              onChange={(e) => runSearch(e.target.value)}
              className="pl-7"
            />
          </div>
          {searching ? (
            <p className="text-md-text-muted text-xs">Recherche...</p>
          ) : contactResults.length > 0 ? (
            <ul className="border-md-border max-h-48 overflow-y-auto rounded-md border bg-white text-sm shadow-sm">
              {contactResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientContactId(c.id);
                      setContactQuery(c.full_name);
                      setContactResults([]);
                    }}
                    className={
                      recipientContactId === c.id
                        ? 'bg-md-magenta/10 w-full px-3 py-2 text-left'
                        : 'hover:bg-muted w-full px-3 py-2 text-left'
                    }
                  >
                    <strong>{c.full_name}</strong>{' '}
                    <span className="text-md-text-muted text-xs">· {c.email}</span>
                    {c.company_name ? (
                      <span className="text-md-text-muted text-xs"> · {c.company_name}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {recipientContactId ? (
            <p className="text-md-text text-xs">Selectionne : {contactQuery}</p>
          ) : null}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="nc-subject">Sujet (optionnel)</Label>
        <Input
          id="nc-subject"
          maxLength={200}
          placeholder="Ex : Suivi inscription"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nc-message">Message *</Label>
        <Textarea
          id="nc-message"
          required
          minLength={1}
          maxLength={5000}
          rows={6}
          placeholder="Tapez votre message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Envoi...
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden />
            Envoyer le premier message
          </>
        )}
      </Button>
    </form>
  );
}
