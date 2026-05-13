import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { capitalizeName } from '@/lib/format/name';
import { loadDashboardData } from '@/lib/espace-exposant/session';
import { ExposantSidebar } from './_components/ExposantSidebar';
import { ExposantMobileMenu } from './_components/ExposantMobileMenu';

/**
 * P5.x.17 — Layout shell de l'Espace Exposant V1.3.
 *
 * Pattern :
 *   - loadDashboardData() valide la session ET fait le redirect si
 *     manquante/expiree -> on a juste a l'appeler ici pour proteger
 *     toute la branche /dashboard/**. Comme loadDashboardData est
 *     wrap dans React.cache(), les sous-pages qui le rappellent ne
 *     refont pas le fetch DB.
 *
 *   - Le shell : sidebar desktop fixe (240px) a gauche + header mobile
 *     avec burger. Le sidebar est dupliquee a l'identique dans le
 *     drawer mobile via ExposantMobileMenu.
 *
 *   - Header desktop minimal : pas de bouton logout (deplace dans
 *     le footer de la sidebar) pour gagner de la verticale ; on
 *     conserve un greeting personnalise + sous-titre.
 *
 * Le redirect interne de loadDashboardData garantit qu'on ne peut
 * pas atterrir sur une sous-page sans session valide (sinon redirect
 * vers /espace-exposant?error=expired).
 */

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}

export const dynamic = 'force-dynamic';

export default async function EspaceExposantDashboardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Side-effect d'auth : redirect si pas de session. Le retour sert
  // au header pour saluer l'exposant par son prenom.
  const data = await loadDashboardData(locale);
  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });
  const firstName = capitalizeName(data.contact.first_name);

  return (
    <div className="bg-md-bg flex min-h-svh flex-col">
      {/* Header mobile (burger + titre) -- masque sur md+ */}
      <header className="border-md-border bg-card sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2 md:hidden">
        <ExposantMobileMenu />
        <div className="flex-1">
          <p className="text-md-magenta text-[9px] font-bold tracking-widest uppercase">
            MediaDays Solutions 2026
          </p>
          <h1 className="text-md-text text-sm font-semibold">{t('shortGreeting')}</h1>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop fixe */}
        <aside className="border-md-border bg-card hidden w-60 shrink-0 border-r md:block">
          <ExposantSidebar />
        </aside>

        {/* Zone principale */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            <header className="hidden md:block">
              <p className="text-md-magenta text-xs font-semibold tracking-widest uppercase">
                MediaDays Solutions 2026
              </p>
              <h1 className="text-md-text text-2xl font-extrabold tracking-tight md:text-3xl">
                {t('greeting', { firstName: firstName || '' })}
              </h1>
              <p className="text-md-text-muted mt-1 text-sm">{t('welcome')}</p>
            </header>

            {children}

            <section className="border-md-border bg-md-bg-soft space-y-1 rounded-lg border p-5 text-sm shadow-sm sm:p-6">
              <p className="text-md-text font-semibold">{t('contact.section')}</p>
              <p className="text-md-text-muted">
                {t('contact.body')}{' '}
                <a href={`mailto:${t('contact.email')}`} className="text-md-blue hover:underline">
                  {t('contact.email')}
                </a>
              </p>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
