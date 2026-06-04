'use client';

/**
 * P12.x.SuperAdminQuickLogin — section sidebar admin dediee aux raccourcis
 * super_admin (visible UNIQUEMENT pour ce role). Rendue inline dans
 * AdminSidebar.
 *
 * Pas de Link (les server actions ouvrent le cookie de session puis on
 * fait window.location.href = redirect_url pour declencher un full
 * reload — necessaire pour que le middleware relise le cookie).
 */

import { useTransition, useState } from 'react';
import { UserCog, Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  quickLoginAsAffilieDemoAction,
  quickLoginAsPartenaireDemoAction,
} from '@/lib/admin/quick-login/actions';

interface Props {
  onNavigate?: () => void;
}

export function QuickLoginSection({ onNavigate }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handle(
    action: () => Promise<{ ok: true; redirect_url: string } | { ok: false; error: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onNavigate?.();
      window.location.href = result.redirect_url;
    });
  }

  return (
    <div>
      <div className="text-md-text-muted px-2 pb-1.5 text-[10px] font-bold tracking-widest uppercase">
        Démo (super_admin)
      </div>
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handle(quickLoginAsAffilieDemoAction)}
            className={cn(
              'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition',
              'text-md-text hover:bg-muted hover:text-md-text',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span className="flex items-center gap-2">
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <UserCog className="size-4" aria-hidden />
              )}
              <span>Démo Affilié</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handle(quickLoginAsPartenaireDemoAction)}
            className={cn(
              'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition',
              'text-md-text hover:bg-muted hover:text-md-text',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span className="flex items-center gap-2">
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Building2 className="size-4" aria-hidden />
              )}
              <span>Démo Partenaire</span>
            </span>
          </button>
        </li>
      </ul>
      {error ? (
        <p className="mt-2 px-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
