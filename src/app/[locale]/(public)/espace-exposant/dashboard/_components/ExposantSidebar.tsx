'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { EXPOSANT_NAV_ITEMS, filterNavItemsForProfile } from './nav-items';
import { LogoutButton } from './LogoutButton';
import { getSpaceTitle, type ContactProfile } from '@/lib/espace-exposant/detect-profile';

/**
 * P5.x.17 — Sidebar de l'Espace Exposant V1.3.
 *
 * Pattern recycle d'AdminSidebar (composants/admin/AdminSidebar.tsx) :
 * meme look-and-feel (rounded items, active state avec accent gauche,
 * hover muted) pour cohrence MDS.
 *
 * Utilise par 2 callers :
 *   - layout.tsx desktop : <aside class="hidden md:block">
 *   - ExposantMobileMenu : dans le drawer (Sheet) mobile
 *
 * `onNavigate` est appele apres un clic, utile pour fermer le drawer
 * mobile (le desktop ignore le callback).
 */
interface Props {
  /** Callback optionnel apres un clic sur un item (fermeture du drawer mobile). */
  onNavigate?: () => void;
  /** P8.2 : profile contact pour filtrer les items dynamiquement. */
  profile: ContactProfile | null;
}

export function ExposantSidebar({ onNavigate, profile }: Props) {
  const pathname = usePathname() ?? '';
  const locale = useLocale();
  const t = useTranslations('espaceExposant.nav');

  const baseHref = `/${locale}/espace-exposant/dashboard`;
  const visibleItems = filterNavItemsForProfile(EXPOSANT_NAV_ITEMS, profile);
  // P8.2-label-fix : label adaptatif centralise (coherent avec le titre
  // central du dashboard et le SheetTitle mobile a11y).
  const spaceTitle = getSpaceTitle(profile, locale === 'en' ? 'en' : 'fr');

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-2 pt-2">
        <p className="text-md-magenta text-[10px] font-bold tracking-widest uppercase">
          MediaDays Solutions 2026
        </p>
        <h2 className="text-md-text mt-0.5 text-base font-semibold">{spaceTitle}</h2>
      </div>

      <nav className="flex-1">
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const href = `${baseHref}/${item.segment}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={item.segment}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-md px-2 py-2 text-sm transition',
                    isActive
                      ? 'bg-md-blue/10 text-md-blue font-semibold'
                      : 'text-md-text hover:bg-muted hover:text-md-text',
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="bg-md-blue absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-r"
                    />
                  ) : null}
                  <span aria-hidden className="text-base">
                    {item.emoji}
                  </span>
                  <span>{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-md-border border-t pt-3">
        {/* P5.x.17-ter : LogoutButton (form POST) au lieu d'un <Link>
            -- Next.js prefetchait l'ancienne route GET /logout et tuait
            la session avant meme un clic utilisateur. */}
        <LogoutButton onLogout={onNavigate} label={t('logout')} />
      </div>
    </div>
  );
}
