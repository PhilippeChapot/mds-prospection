'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ADMIN_LABEL_BY_HREF } from './nav-config';

export function Breadcrumb() {
  const pathname = usePathname();
  const entry = ADMIN_LABEL_BY_HREF[pathname];

  if (!entry) {
    return (
      <span className="text-xs font-medium text-white/70">
        Admin · <span className="text-white/90">Pipeline</span>
      </span>
    );
  }

  if (pathname === '/admin') {
    return (
      <span className="text-xs font-medium text-white/70">
        Admin · <span className="font-semibold text-white">{entry.label}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs font-medium text-white/70">
      <span>Admin</span>
      <ChevronRight className="size-3 opacity-50" aria-hidden />
      <span>{entry.section}</span>
      <ChevronRight className="size-3 opacity-50" aria-hidden />
      <span className="font-semibold text-white">{entry.label}</span>
    </span>
  );
}
