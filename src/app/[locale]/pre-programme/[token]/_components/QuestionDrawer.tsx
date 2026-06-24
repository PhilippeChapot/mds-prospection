'use client';

/**
 * P16.x.PreProgrammeQuestionDrawer — FAB sticky « Une question ? » + Sheet
 * (droite) contenant un formulaire de contact. Réutilise le pipeline lead via
 * submitPreProgrammeQuestionAction (source_detail='preprogramme_drawer').
 */

import { useState, useTransition } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitPreProgrammeQuestionAction } from '@/lib/public/preprogramme/question-actions';

export function QuestionDrawer({ locale }: { locale: 'fr' | 'en' }) {
  const t = (fr: string, en: string) => (locale === 'fr' ? fr : en);
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await submitPreProgrammeQuestionAction({
        locale,
        org_name: orgName.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_email: email.trim(),
        message: message.trim(),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        t('Message envoyé, nous revenons vers vous.', 'Message sent, we’ll get back to you.'),
      );
      setOrgName('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setMessage('');
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-6 z-50 inline-flex items-center gap-2 rounded-full bg-[#294294] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
      >
        <MessageCircle className="size-4" aria-hidden />
        {t('Une question ?', 'A question?')}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetTitle>{t('Une question ?', 'A question?')}</SheetTitle>
          <SheetDescription>
            {t(
              'Posez votre question sur le programme — notre équipe vous répond.',
              'Ask about the programme — our team will reply.',
            )}
          </SheetDescription>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3 px-4 pb-6" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="qd-org">{t('Société', 'Company')} *</Label>
              <Input
                id="qd-org"
                autoComplete="organization"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qd-first">{t('Prénom', 'First name')} *</Label>
                <Input
                  id="qd-first"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qd-last">{t('Nom', 'Last name')} *</Label>
                <Input
                  id="qd-last"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qd-email">Email *</Label>
              <Input
                id="qd-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qd-msg">{t('Votre question', 'Your question')}</Label>
              <Textarea
                id="qd-msg"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t('Envoyer', 'Send')}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
