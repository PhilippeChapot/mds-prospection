/**
 * Layout shell Espace Affilie — P7.x.1.B
 *
 * Shell visuel : sidebar desktop 240px gauche + header burger mobile.
 * Pattern direct copie de l'EspacePartenaireDashboardLayout (P5.x.17).
 *
 * Auth check cheap (cookie + JWT, ZERO query DB) en haut du layout via
 * requireAffilieSession. Si KO -> redirect /{locale}/affilie?error=...
 *
 * Le greeting personnalise n'est PAS affiche ici (ca demanderait un
 * fetch DB) -- chaque sous-section charge ses donnees independamment.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { AffilieSidebar } from './_components/AffilieSidebar';
import { AffilieMobileMenu } from './_components/AffilieMobileMenu';
import { DemoModeBanner } from '@/components/admin/DemoModeBanner';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}

export const dynamic = 'force-dynamic';

export default async function AffilieDashboardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAffilieSession(locale);

  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard' });

  const localeSafe = locale === 'en' ? 'en' : 'fr';

  return (
    <div className="bg-md-bg flex min-h-svh flex-col">
      <DemoModeBanner locale={localeSafe} space="affilie" />
      {/* Header mobile (burger + titre) — masque sur md+ */}
      <header className="border-md-border bg-card sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2 md:hidden">
        <AffilieMobileMenu />
        <div className="flex-1">
          <p className="text-md-magenta text-[9px] font-bold tracking-widest uppercase">
            MediaDays Solutions 2026
          </p>
          <h1 className="text-md-text text-sm font-semibold">{t('shortTitle')}</h1>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop fixe */}
        <aside className="border-md-border bg-card hidden w-60 shrink-0 border-r md:block">
          <AffilieSidebar />
        </aside>

        {/* Zone principale */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl space-y-5">
            <header className="hidden md:block">
              <p className="text-md-magenta text-xs font-semibold tracking-widest uppercase">
                MediaDays Solutions 2026
              </p>
              <h1 className="text-md-text text-2xl font-extrabold tracking-tight md:text-3xl">
                {t('shortTitle')}
              </h1>
              <p className="text-md-text-muted mt-1 text-sm">{t('welcome')}</p>
            </header>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
