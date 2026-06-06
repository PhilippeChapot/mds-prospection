'use client';

/**
 * P7.x.AffiliePitchsAndChat — bouton "Contacter l equipe MDS" affilie.
 *
 * Calque sur NewPartenaireConversationButton P9.2 — change l action
 * server (startConversationFromAffilieAction) + redirect vers la page
 * affilie. Sujet OBLIGATOIRE (vs optionnel cote partenaire) car le staff
 * doit pouvoir router rapidement.
 */

import { useState, useTransition } from 'react';
// P13.x.Phase2 : next/navigation conserve volontairement -- le push fait
// vers `/${locale}/affilie/dashboard/messages/${id}` avec le prefixe locale
// explicite, ce qui est incompatible avec le typage strict de next-intl
// (PATHNAMES ne couvre que les routes a slug FR/EN distinct).
import { useRouter } from 'next/navigation';
import { MessagesSquare, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { startConversationFromAffilieAction } from '@/lib/affilie/messaging-actions';

const COPY = {
  fr: {
    trigger: "Contacter l'équipe MDS",
    title: 'Nouveau message',
    description: "Votre message arrive directement chez l'équipe MediaDays Solutions.",
    subject: 'Sujet',
    subjectPlaceholder: 'Ex : Question sur mes commissions',
    message: 'Votre message',
    messagePlaceholder: "Bonjour, j'aimerais savoir...",
    submit: 'Envoyer',
    submitting: 'Envoi…',
    success: 'Message envoyé ✅',
    cancel: 'Annuler',
    emptySubject: 'Sujet requis.',
    emptyBody: 'Message vide.',
  },
  en: {
    trigger: 'Contact the MDS team',
    title: 'New message',
    description: 'Your message reaches the MediaDays Solutions team directly.',
    subject: 'Subject',
    subjectPlaceholder: 'Ex: Question about my commissions',
    message: 'Your message',
    messagePlaceholder: "Hello, I'd like to know...",
    submit: 'Send',
    submitting: 'Sending…',
    success: 'Message sent ✅',
    cancel: 'Cancel',
    emptySubject: 'Subject required.',
    emptyBody: 'Empty message.',
  },
} as const;

export function NewAffilieConversationButton({ locale }: { locale: 'fr' | 'en' }) {
  const router = useRouter();
  const t = COPY[locale];
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!subject.trim()) {
      toast.error(t.emptySubject);
      return;
    }
    if (!message.trim()) {
      toast.error(t.emptyBody);
      return;
    }
    startTransition(async () => {
      const r = await startConversationFromAffilieAction({
        locale,
        subject: subject.trim(),
        initial_message: message.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t.success);
      setOpen(false);
      setSubject('');
      setMessage('');
      router.push(`/${locale}/affilie/dashboard/messages/${r.data?.conversation_id}`);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <MessagesSquare className="size-4" aria-hidden />
          {t.trigger}
        </Button>
      </SheetTrigger>
      {/* P6.x-BURGER-FIX-ter : pas de `relative` ici (laisse `fixed` primitive). */}
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetTitle>{t.title}</SheetTitle>
        <SheetDescription>{t.description}</SheetDescription>
        <div className="space-y-3 px-4 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="aff-subj">{t.subject}</Label>
            <Input
              id="aff-subj"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t.subjectPlaceholder}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aff-msg">{t.message}</Label>
            <Textarea
              id="aff-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.messagePlaceholder}
              rows={6}
              maxLength={5000}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SheetClose asChild>
              <Button variant="outline" disabled={pending}>
                {t.cancel}
              </Button>
            </SheetClose>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {pending ? t.submitting : t.submit}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
