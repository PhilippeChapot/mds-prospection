'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { consumeVisitorPasswordResetAction } from '@/lib/auth/visitor-password-reset-actions';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function VisitorResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('espaceVisiteur.resetPassword');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setStatus('error');
      setErrorKey('passwords_mismatch');
      return;
    }
    setStatus('submitting');
    setErrorKey(null);

    const result = await consumeVisitorPasswordResetAction({ token, new_password: password });
    if (!result.ok) {
      setStatus('error');
      setErrorKey(result.error);
      return;
    }
    setStatus('success');
  }

  if (status === 'success') {
    return (
      <Card className="border-md-border bg-md-success/[0.04] flex items-start gap-3 p-5 shadow-sm">
        <CheckCircle2 className="text-md-success mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="space-y-3">
          <p className="text-md-text text-sm leading-relaxed">{t('success')}</p>
          <Link
            href="/espace-visiteur"
            className="text-md-blue inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            {t('goToLogin')}
          </Link>
        </div>
      </Card>
    );
  }

  const resolvedError = errorKey
    ? ['token_invalid', 'token_expired', 'token_already_used', 'passwords_mismatch'].includes(
        errorKey,
      )
      ? t(
          `error.${errorKey as 'token_invalid' | 'token_expired' | 'token_already_used' | 'passwords_mismatch'}`,
        )
      : t('error.generic')
    : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="visitor-reset-new-pwd" className="font-semibold">
              {t('newPasswordLabel')}
            </Label>
            <Input
              id="visitor-reset-new-pwd"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === 'submitting'}
              required
              minLength={8}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="visitor-reset-confirm-pwd" className="font-semibold">
              {t('confirmLabel')}
            </Label>
            <Input
              id="visitor-reset-confirm-pwd"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={status === 'submitting'}
              required
              minLength={8}
            />
          </div>

          {resolvedError && (
            <p role="alert" className="text-destructive text-xs">
              {resolvedError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={status === 'submitting' || !password || !confirm}
          className="bg-md-blue hover:bg-md-blue-dark w-full"
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('submitLoading')}
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" aria-hidden />
              {t('submit')}
            </>
          )}
        </Button>
      </Card>
    </form>
  );
}
