'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { replyAsAffilieAction } from '@/lib/affilie/messaging-actions';

interface Props {
  conversationId: string;
  locale: 'fr' | 'en';
}

const COPY = {
  fr: {
    placeholder: 'Votre réponse…',
    send: 'Envoyer',
    sending: 'Envoi…',
    success: 'Réponse envoyée ✅',
    empty: 'Message vide.',
  },
  en: {
    placeholder: 'Your reply…',
    send: 'Send',
    sending: 'Sending…',
    success: 'Reply sent ✅',
    empty: 'Empty message.',
  },
} as const;

export function AffilieReplyForm({ conversationId, locale }: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  const t = COPY[locale];

  function handleSubmit() {
    if (!body.trim()) {
      toast.error(t.empty);
      return;
    }
    startTransition(async () => {
      const r = await replyAsAffilieAction({
        locale,
        conversation_id: conversationId,
        body: body.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t.success);
      setBody('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t.placeholder}
        rows={4}
        maxLength={5000}
      />
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {pending ? t.sending : t.send}
        </Button>
      </div>
    </div>
  );
}
