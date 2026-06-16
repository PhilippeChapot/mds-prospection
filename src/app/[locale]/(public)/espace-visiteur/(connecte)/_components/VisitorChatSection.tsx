'use client';

/**
 * P15.4-bis — section chat sur l'accueil visiteur. Réutilise le widget natif
 * P9.1 (submitVisitorMessageAction) avec l'identité du visiteur pré-remplie.
 */
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitVisitorMessageAction } from '@/lib/visitor-messages/actions';

export function VisitorChatSection({
  locale,
  prefill,
}: {
  locale: 'fr' | 'en';
  prefill: {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    phone: string;
  };
}) {
  const t = useTranslations('espaceVisiteur.chat');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState(prefill.phone);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await submitVisitorMessageAction({
          visitor_first_name: prefill.firstName || 'Visiteur',
          visitor_last_name: prefill.lastName || 'MDS',
          visitor_email: prefill.email,
          visitor_company: prefill.company || 'Visiteur MDS',
          visitor_phone: phone,
          message,
          page_url: typeof window !== 'undefined' ? window.location.href : undefined,
          locale,
        });
        if (!res.ok) {
          setError(t('error'));
          return;
        }
        setSent(true);
        setMessage('');
      } catch {
        setError(t('error'));
      }
    });
  }

  return (
    <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="text-md-blue size-4 shrink-0" aria-hidden />
        <h2 className="text-md-text font-semibold">{t('title')}</h2>
      </div>
      <p className="text-md-text-muted text-sm">{t('body')}</p>

      {sent ? (
        <div className="bg-md-success/[0.05] border-md-border flex items-start gap-2 rounded-md border p-3">
          <CheckCircle2 className="text-md-success mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-md-text text-sm">{t('success')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {!prefill.phone && (
            <div className="space-y-1.5">
              <Label className="font-semibold">{t('phone')}</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-semibold">{t('message')}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
              minLength={5}
              maxLength={2000}
              placeholder={t('placeholder')}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || message.trim().length < 5}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t('sending')}
              </>
            ) : (
              t('send')
            )}
          </Button>
        </form>
      )}
    </section>
  );
}
