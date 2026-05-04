import { useTranslations } from 'next-intl';
import { FileQuestion } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/**
 * 404 publique custom — utilisee par notFound() dans toutes les pages
 * du group (public). Le HeaderLogo + LocaleSwitcher viennent de
 * (public)/layout.tsx (parent).
 *
 * Note Next : not-found.tsx ne reçoit pas params, donc on ne peut pas
 * connaitre la locale. On utilise useTranslations qui lit le contexte
 * NextIntlClientProvider du layout parent — fonctionne tant que la
 * page est sous le wrapper [locale]/.
 */
export default function PublicNotFound() {
  const t = useTranslations('notFound');

  return (
    <section className="mx-auto max-w-xl px-4 py-20 sm:px-6">
      <Card className="border-md-border space-y-5 p-8 text-center shadow-sm sm:p-10">
        <div className="bg-md-magenta/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <FileQuestion className="text-md-magenta h-8 w-8" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-md-text-muted text-xs font-semibold tracking-widest uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="text-md-text text-3xl font-extrabold">{t('heading')}</h1>
          <p className="text-md-text-muted">{t('body')}</p>
        </div>
        <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
          <Link href="/">{t('cta')}</Link>
        </Button>
      </Card>
    </section>
  );
}
