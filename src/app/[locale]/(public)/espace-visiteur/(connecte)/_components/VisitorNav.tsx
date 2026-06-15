'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function VisitorNav() {
  const t = useTranslations('espaceVisiteur.nav');
  const pathname = usePathname();

  const items = [
    { href: '/espace-visiteur/accueil' as const, label: t('home') },
    { href: '/espace-visiteur/parametres' as const, label: t('settings') },
  ];

  return (
    <nav className="flex items-center gap-1">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              active
                ? 'bg-md-magenta/10 text-md-magenta'
                : 'text-md-text-muted hover:text-md-text hover:bg-muted',
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
