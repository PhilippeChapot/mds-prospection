import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireContactSession } from '@/lib/espace-exposant/session';
import { detectUserProfile, getSpaceTitle } from '@/lib/espace-exposant/detect-profile';
import { ExposantSidebar } from './_components/ExposantSidebar';
import { ExposantMobileMenu } from './_components/ExposantMobileMenu';

/**
 * P5.x.17 / P5.x.17-bis / P8.2 — Layout shell de l'Espace Contact V2.
 *
 * Pattern :
 *   - `requireContactSession(locale)` : check cookie+JWT + resolve
 *     contactId (et prospectId si dispo). Redirect vers /espace-exposant
 *     ?error=expired si KO. P8.2 : accepte aussi les contacts simples
 *     sans prospect (kind='contact').
 *   - `detectUserProfile(contactId)` : 1 query pour calculer les flags
 *     qui pilotent le menu dynamique (is_exposant, is_lead, is_affiliate,
 *     has_stand).
 *   - Shell : sidebar desktop fixe 240px + header mobile burger.
 *   - Titre adaptatif selon profil : "Espace exposant" / "Espace affilié"
 *     / "Mon espace MediaDays".
 */

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}

export const dynamic = 'force-dynamic';

export default async function EspaceExposantDashboardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // P8.2 : check session (accepte contacts simples sans prospect).
  const session = await requireContactSession(locale);
  // P8.2 : flags pour menu dynamique + titre.
  const profile = await detectUserProfile(session.contactId);

  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });

  // P8.2-label-fix : titre adaptatif centralise dans getSpaceTitle pour
  // etre coherent avec ExposantSidebar h2 + SheetTitle sr-only mobile.
  const localeSafe = locale === 'en' ? 'en' : 'fr';
  const spaceTitle = getSpaceTitle(profile, localeSafe);

  return (
    <div className="bg-md-bg flex min-h-svh flex-col">
      {/* Header mobile (burger + titre) — masque sur md+ */}
      <header className="border-md-border bg-card sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2 md:hidden">
        <ExposantMobileMenu profile={profile} />
        <div className="flex-1">
          <p className="text-md-magenta text-[9px] font-bold tracking-widest uppercase">
            MediaDays Solutions 2026
          </p>
          <h1 className="text-md-text text-sm font-semibold">{spaceTitle}</h1>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop fixe */}
        <aside className="border-md-border bg-card hidden w-60 shrink-0 border-r md:block">
          <ExposantSidebar profile={profile} />
        </aside>

        {/* Zone principale */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-3xl space-y-5">
            <header className="hidden md:block">
              <p className="text-md-magenta text-xs font-semibold tracking-widest uppercase">
                MediaDays Solutions 2026
              </p>
              <h1 className="text-md-text text-2xl font-extrabold tracking-tight md:text-3xl">
                {spaceTitle}
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
