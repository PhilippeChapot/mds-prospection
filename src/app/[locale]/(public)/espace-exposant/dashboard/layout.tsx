import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireEspaceExposantSession } from '@/lib/espace-exposant/session';
import { ExposantSidebar } from './_components/ExposantSidebar';
import { ExposantMobileMenu } from './_components/ExposantMobileMenu';

/**
 * P5.x.17 / P5.x.17-bis — Layout shell de l'Espace Exposant V1.3.
 *
 * Pattern :
 *   - `requireEspaceExposantSession(locale)` : check rapide cookie+JWT,
 *     redirect vers /espace-exposant?error=... si KO. ZERO query DB.
 *     -> protege toute la branche /dashboard/** sans dupliquer le fetch
 *     des donnees prospect/contact/company (que chaque page recharge
 *     elle-meme via loadDashboardData).
 *
 *   - Shell : sidebar desktop fixe 240px a gauche + header mobile burger.
 *     Sidebar dupliquee a l'identique dans le drawer mobile via
 *     ExposantMobileMenu.
 *
 *   - Le greeting personnalise ("Bonjour {firstName}") n'est pas affiche
 *     ici -- chaque page peut l'afficher si elle veut, mais le layout
 *     reste neutre pour eviter de devoir fetch les donnees deux fois.
 *
 * P5.x.17-bis (bugfix) : on enleve la double-load DB en layout. Symptome
 * detecte par Phil = la nav sidebar redirigeait vers /login, comme si la
 * session etait perdue. Le wrap React.cache initial faisait potentiellement
 * du double-fetch a chaque sous-route, augmentant les chances de timeout
 * silencieux ou d'inconsistance. Maintenant : layout = check cookie/JWT
 * uniquement, pages = fetch donnees.
 */

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}

export const dynamic = 'force-dynamic';

export default async function EspaceExposantDashboardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Side-effect d'auth : redirect vers /espace-exposant?error=expired|
  // invalid si cookie absent ou JWT pas bon. Aucun fetch DB.
  await requireEspaceExposantSession(locale);

  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });

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
                {t('shortGreeting')}
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
