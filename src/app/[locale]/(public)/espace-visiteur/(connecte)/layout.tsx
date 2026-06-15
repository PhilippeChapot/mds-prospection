import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireVisitorSession } from '@/lib/espace-visiteur/session';
import { VisitorNav } from './_components/VisitorNav';
import { VisitorLogoutButton } from './_components/VisitorLogoutButton';

export const dynamic = 'force-dynamic';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}

export default async function EspaceVisiteurConnecteLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Protège toutes les sous-routes (accueil, parametres). Redirect si KO.
  await requireVisitorSession(locale);

  const t = await getTranslations({ locale, namespace: 'espaceVisiteur' });

  return (
    <div className="bg-md-bg flex min-h-svh flex-col">
      <header className="border-md-border bg-card sticky top-0 z-30 border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div>
            <p className="text-md-magenta text-[9px] font-bold tracking-widest uppercase">
              MediaDays Solutions 2026
            </p>
            <p className="text-md-text text-sm font-semibold">{t('title')}</p>
          </div>
          <div className="flex items-center gap-2">
            <VisitorNav />
            <VisitorLogoutButton label={t('nav.logout')} />
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">{children}</div>
      </main>
    </div>
  );
}
