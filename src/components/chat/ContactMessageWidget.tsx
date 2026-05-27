'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { MessageSquare, X, Loader2, CheckCircle2 } from 'lucide-react';
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
import { submitVisitorMessageAction } from '@/lib/visitor-messages/actions';

/**
 * P9.1-natif — widget de messagerie visiteur native.
 *
 * P9.1-natif-bis : formulaire enrichi pour capturer des leads
 * qualifies. Champs : Prénom + Nom (colonnes), Email, Société, URL
 * société (optionnel), Téléphone (OBLIGATOIRE), Message.
 *
 * Submit -> server action submitVisitorMessageAction -> message stocke
 * en DB + lead prospect cree (company name + website + contact
 * first/last + phone) + notif email admin.
 */

const COPY = {
  fr: {
    triggerLabel: 'Une question ?',
    title: 'Écrivez-nous, on vous répond vite 👋',
    description: 'Laissez-nous un message, nous reviendrons par email rapidement.',
    firstNameLabel: 'Prénom',
    firstNamePlaceholder: 'Marie',
    lastNameLabel: 'Nom',
    lastNamePlaceholder: 'Dupont',
    emailLabel: 'Email',
    emailPlaceholder: 'vous@exemple.fr',
    companyLabel: 'Société',
    companyPlaceholder: 'MediaCorp SAS',
    companyUrlLabel: 'Site web de la société',
    companyUrlPlaceholder: 'https://votresite.com (optionnel)',
    phoneLabel: 'Téléphone',
    phonePlaceholder: '+33 6 12 34 56 78',
    messageLabel: 'Votre message',
    messagePlaceholder: "Bonjour, j'aimerais savoir...",
    submit: 'Envoyer',
    submitting: 'Envoi en cours...',
    successTitle: 'Message envoyé ✅',
    successBody: 'Merci ! Nous vous répondrons par email dans la journée.',
    closeAria: 'Fermer',
    minMessage: 'Votre message doit faire au moins 5 caractères.',
    requiredFields: 'Tous les champs marqués * sont requis.',
    invalidUrl: 'URL de site web invalide.',
  },
  en: {
    triggerLabel: 'Need help?',
    title: 'Write to us, quick reply guaranteed 👋',
    description: 'Leave us a message and we will reply by email shortly.',
    firstNameLabel: 'First name',
    firstNamePlaceholder: 'Mary',
    lastNameLabel: 'Last name',
    lastNamePlaceholder: 'Smith',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    companyLabel: 'Company',
    companyPlaceholder: 'MediaCorp Inc.',
    companyUrlLabel: 'Company website',
    companyUrlPlaceholder: 'https://yoursite.com (optional)',
    phoneLabel: 'Phone',
    phonePlaceholder: '+1 555 123 4567',
    messageLabel: 'Your message',
    messagePlaceholder: "Hello, I'd like to know...",
    submit: 'Send',
    submitting: 'Sending...',
    successTitle: 'Message sent ✅',
    successBody: "Thanks! We'll reply by email within the day.",
    closeAria: 'Close',
    minMessage: 'Your message must be at least 5 characters.',
    requiredFields: 'All fields marked with * are required.',
    invalidUrl: 'Invalid company website URL.',
  },
} as const;

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  company: '',
  company_url: '',
  phone: '',
  message: '',
};

export function ContactMessageWidget() {
  const locale = useLocale();
  const t = COPY[locale === 'en' ? 'en' : 'fr'];
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm(INITIAL_FORM);
    setError(null);
    setDone(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const company = form.company.trim();
    const phone = form.phone.trim();
    const message = form.message.trim();
    const companyUrl = form.company_url.trim();

    if (
      firstName.length < 2 ||
      lastName.length < 2 ||
      email.length === 0 ||
      company.length < 2 ||
      phone.length < 6
    ) {
      setError(t.requiredFields);
      return;
    }
    if (message.length < 5) {
      setError(t.minMessage);
      return;
    }
    // URL societe : vide accepte, sinon validation cote Zod (server).

    startTransition(async () => {
      const r = await submitVisitorMessageAction({
        visitor_first_name: firstName,
        visitor_last_name: lastName,
        visitor_email: email,
        visitor_company: company,
        visitor_company_url: companyUrl || undefined,
        visitor_phone: phone,
        message,
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
          if (!v && done) setTimeout(reset, 300);
        }}
      >
        <SheetContent side="right" className="bg-card w-full overflow-y-auto p-0 sm:max-w-md">
          <div className="flex h-full flex-col">
            <div className="bg-md-blue-deep relative px-6 py-5 pr-14 text-white">
              <SheetTitle className="font-[family-name:var(--font-montserrat)] text-lg font-extrabold tracking-tight text-white">
                {t.title}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-white/80">
                {t.description}
              </SheetDescription>
              {/* P9.1-natif-mobile : croix de fermeture toujours visible
                  (top-right), tap-target ≥ 44px pour les mobiles. */}
              <SheetClose
                aria-label={t.closeAria}
                className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                <X className="size-5" aria-hidden />
              </SheetClose>
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
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 px-6 py-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cmw-first-name">{t.firstNameLabel} *</Label>
                    <Input
                      id="cmw-first-name"
                      required
                      minLength={2}
                      maxLength={60}
                      autoComplete="given-name"
                      placeholder={t.firstNamePlaceholder}
                      value={form.first_name}
                      onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cmw-last-name">{t.lastNameLabel} *</Label>
                    <Input
                      id="cmw-last-name"
                      required
                      minLength={2}
                      maxLength={60}
                      autoComplete="family-name"
                      placeholder={t.lastNamePlaceholder}
                      value={form.last_name}
                      onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-email">{t.emailLabel} *</Label>
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
                  <Label htmlFor="cmw-company">{t.companyLabel} *</Label>
                  <Input
                    id="cmw-company"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="organization"
                    placeholder={t.companyPlaceholder}
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-company-url">{t.companyUrlLabel}</Label>
                  <Input
                    id="cmw-company-url"
                    type="url"
                    maxLength={300}
                    autoComplete="url"
                    placeholder={t.companyUrlPlaceholder}
                    value={form.company_url}
                    onChange={(e) => setForm((f) => ({ ...f, company_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-phone">{t.phoneLabel} *</Label>
                  <Input
                    id="cmw-phone"
                    type="tel"
                    required
                    minLength={6}
                    maxLength={30}
                    autoComplete="tel"
                    placeholder={t.phonePlaceholder}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cmw-message">{t.messageLabel} *</Label>
                  <Textarea
                    id="cmw-message"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
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
                <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
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
