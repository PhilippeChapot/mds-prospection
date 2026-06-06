'use client';

/**
 * P7.x.1.B — Sidebar de l'Espace Affilie.
 *
 * Mirror direct du pattern PartenaireSidebar (P5.x.17) : items partages
 * sidebar desktop + drawer mobile, active state via pathname prefix,
 * `onNavigate` pour fermer le drawer apres clic.
 */

import Link from 'next/link';
import { usePathname } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { AFFILIE_NAV_ITEMS } from './nav-items';
import { AffilieLogoutButton } from './LogoutButton';

interface Props {
  /** Callback optionnel apres clic (fermer le drawer mobile). */
  onNavigate?: () => void;
}

export function AffilieSidebar({ onNavigate }: Props) {
  const pathname = usePathname() ?? '';
  const locale = useLocale();
  const t = useTranslations('espaceAffilie.nav');

  const baseHref = `/${locale}/affilie/dashboard`;

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-2 pt-2">
        <p className="text-md-magenta text-[10px] font-bold tracking-widest uppercase">
          MediaDays Solutions 2026
        </p>
        <h2 className="text-md-text mt-0.5 text-base font-semibold">{t('sectionTitle')}</h2>
      </div>

      <nav className="flex-1">
        <ul className="space-y-0.5">
          {AFFILIE_NAV_ITEMS.map((item) => {
            const href = `${baseHref}/${item.segment}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            if (!item.enabled) {
              return (
                <li key={item.segment}>
                  <span
                    aria-disabled
                    title={`Disponible en ${item.phase}`}
                    className="text-md-text-muted flex cursor-not-allowed items-center justify-between rounded-md px-2 py-2 text-sm opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-base">
                        {item.emoji}
                      </span>
                      <span>{t(item.labelKey)}</span>
                    </span>
                    <span className="text-[9px] font-bold tracking-wider uppercase">
                      {item.phase}
                    </span>
                  </span>
                </li>
              );
            }
            return (
              <li key={item.segment}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-md px-2 py-2 text-sm transition',
                    isActive
                      ? 'bg-md-magenta/10 text-md-magenta font-semibold'
                      : 'text-md-text hover:bg-muted hover:text-md-text',
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="bg-md-magenta absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-r"
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
        <AffilieLogoutButton onLogout={onNavigate} label={t('logout')} />
      </div>
    </div>
  );
}
