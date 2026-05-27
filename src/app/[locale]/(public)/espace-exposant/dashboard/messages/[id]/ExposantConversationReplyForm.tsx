'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sendMessageAction } from '@/lib/internal-messaging/actions';

/**
 * P9.2 — form de reponse cote exposant (as_contact=true).
 */
export function ExposantConversationReplyForm({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: 'fr' | 'en';
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (trimmed.length < 1) {
      setError(locale === 'en' ? 'Empty message.' : 'Message vide.');
      return;
    }
    startTransition(async () => {
      const r = await sendMessageAction({
        conversation_id: conversationId,
        body: trimmed,
        as_contact: true,
        locale,
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setBody('');
      toast.success(locale === 'en' ? 'Message sent' : 'Message envoyé');
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        required
        minLength={1}
        maxLength={5000}
        rows={4}
        placeholder={locale === 'en' ? 'Type your message...' : 'Tapez votre message...'}
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
            {locale === 'en' ? 'Sending...' : 'Envoi...'}
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden />
            {locale === 'en' ? 'Send' : 'Envoyer'}
          </>
        )}
      </Button>
    </form>
  );
}
