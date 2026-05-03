'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LOCALES, type AppLocale } from '@/i18n/routing';
import { useTransition } from 'react';

const FLAGS: Record<AppLocale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

export function LocaleSwitcher() {
  const t = useTranslations('publicNav');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale() as AppLocale;
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: AppLocale) {
    if (locale === currentLocale) return;
    const queryEntries = Array.from(searchParams.entries());
    const query = queryEntries.length > 0 ? Object.fromEntries(queryEntries) : undefined;
    startTransition(() => {
      // Cast volontaire : LocaleSwitcher est generique sur toutes les routes du
      // mapping, le type strict de pathnames n'apporte rien ici.
      router.replace(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { pathname: pathname as any, query },
        { locale },
      );
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('switchLanguage')}
          disabled={isPending}
          className="gap-2"
        >
          <Globe className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{FLAGS[currentLocale]}</span>
          <span className="text-xs uppercase">{currentLocale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchTo(locale)}
            disabled={locale === currentLocale}
            className="gap-2"
          >
            <span aria-hidden>{FLAGS[locale]}</span>
            <span>{t(`locale_${locale}`)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
