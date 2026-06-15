'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function VisitorRequestMagicLinkForm({ locale }: { locale: 'fr' | 'en' }) {
  const t = useTranslations('espaceVisiteur.requestLink');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorKey(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('error');
      setErrorKey('invalidEmail');
      return;
    }

    try {
      const response = await fetch('/api/espace-visiteur/request-magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), locale }),
      });
      if (response.status === 429) {
        setStatus('error');
        setErrorKey('rateLimit');
        return;
      }
      if (!response.ok) {
        setStatus('error');
        setErrorKey('generic');
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorKey('generic');
    }
  }

  if (status === 'success') {
    return (
      <Card className="border-md-border bg-md-success/[0.04] flex items-start gap-3 p-5 shadow-sm">
        <CheckCircle2 className="text-md-success mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="text-md-text text-sm leading-relaxed">{t('success')}</p>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        <div className="space-y-1.5">
          <Label htmlFor="visitor-email" className="font-semibold">
            {t('emailLabel')} <span className="text-md-magenta">*</span>
          </Label>
          <Input
            id="visitor-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'submitting'}
            required
          />
          {errorKey && (
            <p role="alert" className="text-destructive text-xs">
              {t(`error.${errorKey}` as Parameters<typeof t>[0])}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={status === 'submitting' || !email.trim()}
          className="bg-md-magenta hover:bg-md-magenta-soft w-full"
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('submitLoading')}
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" aria-hidden />
              {t('submit')}
            </>
          )}
        </Button>
      </Card>
    </form>
  );
}
