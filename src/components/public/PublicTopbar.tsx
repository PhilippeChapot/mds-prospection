import { useTranslations } from 'next-intl';
import { LogIn } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { HeaderLogo } from '@/components/brand/HeaderLogo';
import { LocaleSwitcher } from '@/components/public/LocaleSwitcher';

/**
 * Topbar publique — distincte de AdminTopbar.
 * Aucune dependance auth/season : utilisable sur toutes les routes publiques.
 *
 * Logo MDS + PRS gauche / LocaleSwitcher + bouton Espace Partenaire (placeholder
 * desactive pour P3 — actif en P5) droite.
 */
export function PublicTopbar() {
  const t = useTranslations('publicNav');

  return (
    <header className="border-md-border sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label={t('home')}>
          <HeaderLogo theme="light" size={40} />
        </Link>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Link
            href="/espace-visiteur"
            className="text-md-magenta hover:bg-md-magenta/5 hidden items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition sm:inline-flex"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden />
            <span>{t('visitorSpace')}</span>
          </Link>
          <Link
            href="/espace-partenaire"
            className="text-md-blue hover:bg-md-blue/5 hidden items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition sm:inline-flex"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden />
            <span>{t('exhibitorSpace')}</span>
          </Link>
          <Button
            asChild
            size="sm"
            className="bg-md-blue-dark hover:bg-md-blue-deep shrink-0 text-white"
          >
            <Link href={{ pathname: '/inscription-partenaire', query: { category: 'partenaire' } }}>
              <span className="sm:hidden">{t('ctaRegisterShort')}</span>
              <span className="hidden sm:inline">{t('ctaRegister')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
