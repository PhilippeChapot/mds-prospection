'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, LogIn } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import { loginVisitorWithPasswordAction } from '@/lib/auth/visitor-password-actions';

type Status = 'idle' | 'submitting' | 'error';

export function VisitorPasswordLoginForm({ locale }: { locale: 'fr' | 'en' }) {
  const t = useTranslations('espaceVisiteur.passwordLogin');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorKey(null);

    const result = await loginVisitorWithPasswordAction({ email, password });
    if (!result.ok) {
      setStatus('error');
      setErrorKey(result.error);
      return;
    }
    router.replace('/espace-visiteur/accueil');
  }

  const errorMessage = errorKey
    ? errorKey === 'invalid_credentials'
      ? t('error.invalid_credentials')
      : t('error.generic')
    : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="border-md-border space-y-5 p-5 shadow-sm sm:p-7">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="visitor-pwd-email" className="font-semibold">
              {t('emailLabel')}
            </Label>
            <Input
              id="visitor-pwd-email"
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
            <Label htmlFor="visitor-pwd-password" className="font-semibold">
              {t('passwordLabel')}
            </Label>
            <Input
              id="visitor-pwd-password"
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
            href="/espace-visiteur/mot-de-passe-oublie"
            className="text-md-blue hover:underline"
          >
            {t('forgotPassword')}
          </Link>
        </p>
      </Card>
    </form>
  );
}
