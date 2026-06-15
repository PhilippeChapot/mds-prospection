'use client';

import { LogOut } from 'lucide-react';
import { useLocale } from 'next-intl';

export function VisitorLogoutButton({ label }: { label: string }) {
  const locale = useLocale();
  return (
    <form action={`/${locale}/espace-visiteur/logout`} method="post">
      <button
        type="submit"
        className="text-md-text-muted hover:text-md-text hover:bg-muted inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition"
      >
        <LogOut className="size-4" aria-hidden />
        <span>{label}</span>
      </button>
    </form>
  );
}
