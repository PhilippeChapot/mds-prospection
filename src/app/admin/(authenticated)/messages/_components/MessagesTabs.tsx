import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * P9.2 — onglets du hub /admin/messages :
 *   - Visiteurs (P9.1-natif)  : messages captés via le widget public.
 *   - Interne   (P9.2)         : conversations staff↔staff + staff↔exposants.
 *
 * Server component (juste 2 liens stylises selon `current`).
 */
export function MessagesTabs({ current }: { current: 'visiteurs' | 'interne' }) {
  const tabs: Array<{ value: 'visiteurs' | 'interne'; label: string; href: string }> = [
    { value: 'visiteurs', label: 'Visiteurs', href: '/admin/messages' },
    { value: 'interne', label: 'Interne', href: '/admin/messages?tab=interne' },
  ];
  return (
    <nav className="border-md-border bg-card -mb-px flex gap-1 rounded-lg border p-1 shadow-sm">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          aria-current={current === t.value ? 'page' : undefined}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold transition',
            current === t.value
              ? 'bg-md-magenta text-white shadow-sm'
              : 'text-md-text hover:bg-muted',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
