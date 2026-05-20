import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Footer publique — RGPD-friendly : adresse + liens legaux + copyright.
 * Aucune trace de cookie tiers ici (pas d'analytics opt-in en P3).
 */
export function PublicFooter() {
  const t = useTranslations('publicNav');
  const tCommon = useTranslations('common');
  const year = new Date().getFullYear();

  return (
    <footer className="border-md-border mt-16 border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div className="text-md-text space-y-2 text-sm">
          <p className="font-semibold">{t('publisher')}</p>
          <p className="text-md-text-muted">
            Editions HF
            <br />
            19000 Brive-la-Gaillarde
            <br />
            France
          </p>
        </div>

        <nav className="space-y-2 text-sm">
          <p className="text-md-text font-semibold">{t('legalSection')}</p>
          <ul className="text-md-text-muted space-y-1.5">
            <li>
              <Link href="/cgv" className="hover:text-md-blue underline-offset-2 hover:underline">
                {t('terms')}
              </Link>
            </li>
            <li>
              <Link
                href="/mentions-legales"
                className="hover:text-md-blue underline-offset-2 hover:underline"
              >
                {t('legalNotice')}
              </Link>
            </li>
            <li>
              <Link
                href="/politique-confidentialite"
                className="hover:text-md-blue underline-offset-2 hover:underline"
              >
                {t('privacyPolicy')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="space-y-2 text-sm">
          <p className="text-md-text font-semibold">{t('eventsSection')}</p>
          {/* P6.x.4-a-decies — 3 etapes 2026 dans l'ordre CHRONOLOGIQUE
              (Bruxelles 26 nov → Marseille 10 dec → Paris 15 dec). */}
          <ul className="text-md-text-muted space-y-1.5">
            <li>{t('eventBruxelles')}</li>
            <li>{t('eventMarseille')}</li>
            <li>{t('eventParis')}</li>
          </ul>
        </div>
      </div>

      <div className="border-md-border text-md-text-muted border-t py-4 text-center text-xs">
        <p>
          © {year} Editions HF · {tCommon('allRightsReserved')}
        </p>
      </div>
    </footer>
  );
}
