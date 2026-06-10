'use client';

/**
 * P11.x — formulaire login par mot de passe.
 * Séparé de RequestMagicLinkForm pour clarté.
 * onSuccess : appelé par PartnerLoginPageClient pour déclencher le redirect.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, LogIn } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import { loginPartnerWithPasswordAction } from '@/lib/auth/partner-password-actions';

type Status = 'idle' | 'submitting' | 'error';

export function PasswordLoginForm({ locale }: { locale: 'fr' | 'en' }) {
  const t = useTranslations('espacePartenaire.passwordLogin');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorKey(null);

    const result = await loginPartnerWithPasswordAction({ email, password });

    if (!result.ok) {
      setStatus('error');
      setErrorKey(result.error);
      return;
    }

    router.replace('/espace-partenaire/dashboard');
  }

  const errorMessage = errorKey
    ? ['invalid_credentials', 'no_password'].includes(errorKey)
      ? t(`error.${errorKey as 'invalid_credentials' | 'no_password'}`)
      : t('error.generic')
    : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pwd-email" className="font-semibold">
              {t('emailLabel')}
            </Label>
            <Input
              id="pwd-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'submitting'}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pwd-password" className="font-semibold">
              {t('passwordLabel')}
            </Label>
            <Input
              id="pwd-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={status === 'submitting'}
              required
            />
          </div>

          {errorMessage && (
            <p role="alert" className="text-destructive text-xs">
              {errorMessage}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={status === 'submitting' || !email.trim() || !password}
          className="bg-md-blue hover:bg-md-blue-dark w-full"
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('submitLoading')}
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" aria-hidden />
              {t('submit')}
            </>
          )}
        </Button>

        <p className="text-center text-sm">
          <Link
            href="/espace-partenaire/mot-de-passe-oublie"
            className="text-md-blue hover:underline"
          >
            {t('forgotPassword')}
          </Link>
        </p>
      </Card>
    </form>
  );
}
