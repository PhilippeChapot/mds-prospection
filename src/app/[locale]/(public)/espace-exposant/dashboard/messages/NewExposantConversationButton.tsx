'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessagesSquare, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createConversationAction } from '@/lib/internal-messaging/actions';

/**
 * P9.2 — bouton "+ Contacter l'equipe MDS" cote exposant.
 *
 * Ouvre un Sheet avec un mini-formulaire (sujet optionnel + message
 * initial). Submit -> createConversationAction (as_contact=true, type=
 * support, recipient=staff_pool) -> redirect vers le detail.
 */

const COPY = {
  fr: {
    trigger: "Contacter l'équipe MDS",
    title: 'Nouveau message',
    description: "Votre message arrive directement chez l'équipe MediaDays Solutions.",
    subject: 'Sujet (optionnel)',
    subjectPlaceholder: 'Ex : Question sur mon stand',
    message: 'Votre message',
    messagePlaceholder: "Bonjour, j'aimerais savoir...",
    submit: 'Envoyer',
    submitting: 'Envoi...',
    success: 'Message envoyé ✅',
    cancel: 'Annuler',
    empty: 'Message vide.',
  },
  en: {
    trigger: 'Contact the MDS team',
    title: 'New message',
    description: 'Your message reaches the MediaDays Solutions team directly.',
    subject: 'Subject (optional)',
    subjectPlaceholder: 'Ex: Question about my booth',
    message: 'Your message',
    messagePlaceholder: "Hello, I'd like to know...",
    submit: 'Send',
    submitting: 'Sending...',
    success: 'Message sent ✅',
    cancel: 'Cancel',
    empty: 'Empty message.',
  },
} as const;

export function NewExposantConversationButton({ locale }: { locale: 'fr' | 'en' }) {
  const t = COPY[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (message.trim().length < 1) {
      setError(t.empty);
      return;
    }
    startTransition(async () => {
      const r = await createConversationAction({
        as_contact: true,
        locale,
        type: 'support',
        recipient_type: 'staff_pool',
        recipient_id: null,
        subject: subject.trim() || undefined,
        initial_message: message.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(t.success);
      setOpen(false);
      router.push(`/${locale}/espace-exposant/dashboard/messages/${r.conversation_id}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold text-white shadow-sm transition"
      >
        <MessagesSquare className="size-4" aria-hidden />+ {t.trigger}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="bg-card w-full overflow-y-auto p-0 sm:max-w-md">
          <div className="bg-md-blue-deep relative px-6 py-5 pr-14 text-white">
            <SheetTitle className="text-lg font-extrabold text-white">{t.title}</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-white/80">
              {t.description}
            </SheetDescription>
            {/* P9.1-natif-mobile : croix de fermeture toujours visible
                (top-right), tap-target ≥ 44px. */}
            <SheetClose
              aria-label={t.cancel}
              className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <X className="size-5" aria-hidden />
            </SheetClose>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3 px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="nec-subject">{t.subject}</Label>
              <Input
                id="nec-subject"
                maxLength={200}
                placeholder={t.subjectPlaceholder}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nec-message">{t.message} *</Label>
              <Textarea
                id="nec-message"
                required
                minLength={1}
                maxLength={5000}
                rows={6}
                placeholder={t.messagePlaceholder}
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
            <div className="flex gap-2">
              <Button type="submit" size="lg" className="flex-1" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t.submitting}
                  </>
                ) : (
                  <>
                    <Send className="size-4" aria-hidden />
                    {t.submit}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                <X className="size-4" aria-hidden />
                {t.cancel}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
