'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_SECTIONS, type AdminNavItem } from './nav-config';

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-md-border bg-card hidden w-60 shrink-0 flex-col gap-4 border-r p-3 md:flex">
      <Link
        href="/admin/quotes/new"
        className={cn(
          'bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center justify-center gap-2',
          'rounded-md px-3 py-2.5 text-sm font-bold text-white shadow-sm transition',
        )}
      >
        <Zap className="size-4" aria-hidden />
        <span>+ Nouveau devis</span>
      </Link>

      <nav className="space-y-4">
        {ADMIN_NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="text-md-text-muted px-2 pb-1.5 text-[10px] font-bold tracking-widest uppercase">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarItem item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function SidebarItem({ item, pathname }: { item: AdminNavItem; pathname: string }) {
  const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

  if (!item.enabled) {
    return (
      <span
        aria-disabled
        title={`Disponible en ${item.phase ?? 'P2-P5'}`}
        className={cn(
          'flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm',
          'text-md-text-muted opacity-60',
        )}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>{item.emoji}</span>
          <span>{item.label}</span>
        </span>
        <span className="text-[9px] font-bold tracking-wider uppercase">{item.phase}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition',
        isActive
          ? 'bg-md-magenta/10 text-md-magenta font-semibold'
          : 'text-md-text hover:bg-muted hover:text-md-text',
      )}
    >
      {isActive && (
        <span
          aria-hidden
          className="bg-md-magenta absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-r"
        />
      )}
      <span className="flex items-center gap-2">
        <span aria-hidden>{item.emoji}</span>
        <span>{item.label}</span>
      </span>
      {item.badge ? (
        <span className="bg-md-blue/10 text-md-blue rounded-full px-1.5 py-0.5 text-[10px] font-bold">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
