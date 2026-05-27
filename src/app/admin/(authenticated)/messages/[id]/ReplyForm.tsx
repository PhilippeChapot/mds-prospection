'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { replyToVisitorMessageAction } from '@/lib/visitor-messages/actions';

/**
 * P9.1-natif — formulaire client pour repondre a un visitor_message.
 *
 * Submit -> server action replyToVisitorMessageAction : insert reply,
 * envoi email Resend (reply-to philippe@), update status='replied',
 * audit log. Toast + reset cote client.
 */
export function ReplyForm({
  messageId,
  visitorEmail,
}: {
  messageId: string;
  visitorEmail: string;
}) {
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (replyText.trim().length < 2) {
      setError('Réponse trop courte.');
      return;
    }
    startTransition(async () => {
      const r = await replyToVisitorMessageAction({
        message_id: messageId,
        reply_text: replyText.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setReplyText('');
      if (r.email_sent) {
        toast.success(`Réponse envoyée à ${visitorEmail}`);
      } else {
        toast.warning('Réponse enregistrée mais email non envoyé', {
          description: 'Le visiteur ne sera pas notifié — vérifier la config Resend.',
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        required
        minLength={2}
        maxLength={5000}
        rows={6}
        placeholder="Écrivez votre réponse..."
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
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
            Envoyer la réponse
          </>
        )}
      </Button>
    </form>
  );
}
