'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sendMessageAction } from '@/lib/internal-messaging/actions';

/**
 * P9.2 — form de reponse dans une conversation interne.
 *
 * Submit -> sendMessageAction (verifie que le viewer est participant) ->
 * insert + bump last_message_at via trigger + notif email aux autres
 * participants (best-effort).
 */
export function ConversationReplyForm({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length < 1) {
      setError('Message vide.');
      return;
    }
    startTransition(async () => {
      const r = await sendMessageAction({ conversation_id: conversationId, body: trimmed });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setBody('');
      toast.success('Message envoyé');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        required
        minLength={1}
        maxLength={5000}
        rows={4}
        placeholder="Tapez votre message..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error ? (
        <p
          role="alert"
          className="border-md-danger/40 bg-md-danger/10 text-md-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Envoi...
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden />
            Envoyer
          </>
        )}
      </Button>
    </form>
  );
}
