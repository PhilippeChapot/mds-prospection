'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { MessageSquare, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitVisitorMessageAction } from '@/lib/visitor-messages/actions';

/**
 * P9.1-natif — widget de messagerie visiteur native.
 *
 * Bouton flottant bas-droite sur les pages publiques. Clic -> Sheet
 * lateral avec mini-formulaire (nom + email + tel optionnel + message).
 * Submit -> server action submitVisitorMessageAction -> message stocke
 * en DB + lead prospect cree + notif email admin.
 *
 * Pas de dependance externe (100% React + Tailwind + shadcn). Locale
 * lue via useLocale() (next-intl). Le widget est rendu uniquement si
 * `visitor_chat_enabled=true` (filtre cote serveur, cf.
 * <VisitorMessageWidgetLoader>).
 */

const COPY = {
  fr: {
    triggerLabel: 'Une question ?',
    title: 'Écrivez-nous, on vous répond vite 👋',
    description: 'Laissez-nous un message, nous reviendrons par email rapidement.',
    nameLabel: 'Nom',
    namePlaceholder: 'Votre nom',
    emailLabel: 'Email',
    emailPlaceholder: 'vous@exemple.fr',
    phoneLabel: 'Téléphone (optionnel)',
    phonePlaceholder: '+33 ...',
    messageLabel: 'Message',
    messagePlaceholder: "Bonjour, j'aimerais savoir...",
    submit: 'Envoyer',
    submitting: 'Envoi en cours...',
    successTitle: 'Message envoyé ✅',
    successBody: 'Merci ! Nous vous répondrons par email dans la journée.',
    closeAria: 'Fermer',
    minMessage: 'Votre message doit faire au moins 5 caractères.',
  },
  en: {
    triggerLabel: 'Need help?',
    title: 'Write to us, quick reply guaranteed 👋',
    description: 'Leave us a message and we will reply by email shortly.',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    phoneLabel: 'Phone (optional)',
    phonePlaceholder: '+1 ...',
    messageLabel: 'Message',
    messagePlaceholder: "Hello, I'd like to know...",
    submit: 'Send',
    submitting: 'Sending...',
    successTitle: 'Message sent ✅',
    successBody: "Thanks! We'll reply by email within the day.",
    closeAria: 'Close',
    minMessage: 'Your message must be at least 5 characters.',
  },
} as const;

export function ContactMessageWidget() {
  const locale = useLocale();
  const t = COPY[locale === 'en' ? 'en' : 'fr'];
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm({ name: '', email: '', phone: '', message: '' });
    setError(null);
    setDone(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 5) {
      setError(t.minMessage);
      return;
    }
    startTransition(async () => {
      const r = await submitVisitorMessageAction({
        visitor_name: form.name.trim(),
        visitor_email: form.email.trim(),
        visitor_phone: form.phone.trim() || undefined,
        message: form.message.trim(),
        page_url: typeof window !== 'undefined' ? window.location.href.slice(0, 500) : undefined,
        locale: locale === 'en' ? 'en' : 'fr',
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      toast.success(t.successTitle, { description: t.successBody });
    });
  }

  return (
    <>
      {/* Bouton flottant bas-droite — visible quand le widget est ferme. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.triggerLabel}
        className="bg-md-magenta hover:bg-md-magenta-soft fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-lg transition sm:right-6 sm:bottom-6"
      >
        <MessageSquare className="size-5" aria-hidden />
        <span className="hidden sm:inline">{t.triggerLabel}</span>
      </button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          // Reset si on rouvre apres un envoi reussi.
          if (!v && done) setTimeout(reset, 300);
        }}
      >
        <SheetContent side="right" className="bg-card w-full p-0 sm:max-w-md">
          <div className="flex h-full flex-col">
            <div className="bg-md-blue-deep px-6 py-5 text-white">
              <SheetTitle className="font-[family-name:var(--font-montserrat)] text-lg font-extrabold tracking-tight text-white">
                {t.title}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-white/80">
                {t.description}
              </SheetDescription>
            </div>

            {done ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <CheckCircle2 className="text-md-success size-10" aria-hidden />
                <h3 className="text-md-blue-dark text-lg font-bold">{t.successTitle}</h3>
                <p className="text-md-text-muted text-sm">{t.successBody}</p>
                <Button
                  onClick={() => {
                    setOpen(false);
                    setTimeout(reset, 300);
                  }}
                  variant="outline"
                  className="mt-4"
                >
                  <X className="size-4" aria-hidden />
                  {t.closeAria}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-6 py-5">
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-name">{t.nameLabel}</Label>
                  <Input
                    id="cmw-name"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                    placeholder={t.namePlaceholder}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-email">{t.emailLabel}</Label>
                  <Input
                    id="cmw-email"
                    type="email"
                    required
                    maxLength={180}
                    autoComplete="email"
                    placeholder={t.emailPlaceholder}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-phone">{t.phoneLabel}</Label>
                  <Input
                    id="cmw-phone"
                    type="tel"
                    maxLength={30}
                    autoComplete="tel"
                    placeholder={t.phonePlaceholder}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-message">{t.messageLabel}</Label>
                  <Textarea
                    id="cmw-message"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={5}
                    placeholder={t.messagePlaceholder}
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
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
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t.submitting}
                    </>
                  ) : (
                    t.submit
                  )}
                </Button>
              </form>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
