import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ResendDoiButton } from './ResendDoiButton';
import type { Locale } from 'next-intl';

export const metadata = {
  title: 'Vérifiez votre email',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ e?: string }>;
}

export default async function CheckEmailPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { e } = await searchParams;
  const masked = e ? decodeURIComponent(e) : null;
  return <Content email={masked} />;
}

function Content({ email }: { email: string | null }) {
  const t = useTranslations('signup.checkEmail');

  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card className="border-md-border space-y-5 p-8 text-center shadow-sm">
        <div className="bg-md-magenta/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <Mail className="text-md-magenta h-7 w-7" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-md-text text-2xl font-bold">{t('heading')}</h1>
          <p className="text-md-text-muted text-base">{t('body')}</p>
          {email && (
            <p className="text-md-text mt-3 text-sm">
              → <span className="font-mono">{email}</span>
            </p>
          )}
        </div>

        <p className="text-md-text-muted border-md-border border-t pt-4 text-xs">{t('spamHint')}</p>

        <ResendDoiButton />

        <div className="border-md-border border-t pt-4 text-xs">
          <span className="text-md-text-muted">{t('wrongEmail')} </span>
          <Link
            href="/inscription-exposant"
            className="text-md-blue underline-offset-2 hover:underline"
          >
            {t('wrongEmailLink')}
          </Link>
        </div>
      </Card>
    </section>
  );
}
