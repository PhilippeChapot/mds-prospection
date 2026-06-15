'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requestVisitorPasswordResetAction } from '@/lib/auth/visitor-password-reset-actions';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function VisitorForgotPasswordForm({ locale }: { locale: 'fr' | 'en' }) {
  const t = useTranslations('espaceVisiteur.forgotPassword');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const result = await requestVisitorPasswordResetAction({ email, locale });
      setStatus(result.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <Card className="border-md-border bg-md-success/[0.04] flex items-start gap-3 p-5 shadow-sm">
        <CheckCircle2 className="text-md-success mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="space-y-3">
          <p className="text-md-text text-sm leading-relaxed">{t('success')}</p>
          <Link
            href="/espace-visiteur"
            className="text-md-blue inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('backToLogin')}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        <div className="space-y-1.5">
          <Label htmlFor="visitor-forgot-email" className="font-semibold">
            {t('emailLabel')}
          </Label>
          <Input
            id="visitor-forgot-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'submitting'}
            required
          />
          {status === 'error' && (
            <p role="alert" className="text-destructive text-xs">
              {t('error.generic')}
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

        <p className="text-center">
          <Link
            href="/espace-visiteur"
            className="text-md-text-muted inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('backToLogin')}
          </Link>
        </p>
      </Card>
    </form>
  );
}
