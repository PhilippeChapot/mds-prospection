'use client';

/**
 * P15.3 — section auth visiteur sur la fiche admin.
 * Boutons : créer compte / renvoyer magic link / envoyer reset / supprimer password.
 */

import { useTransition } from 'react';
import { KeyRound, Mail, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isSuperAdmin } from '@/lib/auth/role-helpers';
import {
  adminCreateVisitorAccountAction,
  adminTriggerVisitorMagicLinkAction,
  adminTriggerVisitorPasswordResetAction,
  adminRemoveVisitorPasswordAction,
} from '@/lib/admin/visitors/auth-admin-actions';

type Account = {
  email: string;
  password_set_at: string | null;
  last_login_at: string | null;
} | null;

function fmt(input: string | null): string {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return input.slice(0, 10);
  }
}

export function VisitorAuthSection({
  visitorId,
  account,
  currentRole,
}: {
  visitorId: string;
  account: Account;
  currentRole: 'admin' | 'sales' | 'super_admin';
}) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error ?? 'Erreur');
          return;
        }
        toast.success(okMsg);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (!account) {
    return (
      <div className="space-y-3">
        <p className="text-md-text-muted text-sm">
          Aucun compte visiteur. Crée-le pour permettre la connexion à l&apos;espace visiteur.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => adminCreateVisitorAccountAction({ visitor_id: visitorId }), 'Compte créé.')
          }
        >
          <UserPlus className="size-4" aria-hidden />
          Créer un compte visiteur
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Email compte
          </dt>
          <dd className="text-md-text font-mono">{account.email}</dd>
        </div>
        <div>
          <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Mot de passe
          </dt>
          <dd className="text-md-text">{account.password_set_at ? '✓ défini' : '— non défini'}</dd>
        </div>
        <div>
          <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
            Dernière connexion
          </dt>
          <dd className="text-md-text">{fmt(account.last_login_at)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => adminTriggerVisitorMagicLinkAction({ visitor_id: visitorId }),
              'Magic link envoyé.',
            )
          }
        >
          <Mail className="size-4" aria-hidden />
          Renvoyer magic link
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => adminTriggerVisitorPasswordResetAction({ visitor_id: visitorId }),
              'Lien reset envoyé.',
            )
          }
        >
          <KeyRound className="size-4" aria-hidden />
          Envoyer reset password
        </Button>
        {isSuperAdmin(currentRole) && account.password_set_at ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            className="text-md-danger border-md-danger/30 hover:bg-md-danger/5"
            onClick={() => {
              if (!window.confirm('Supprimer le mot de passe de ce visiteur ?')) return;
              run(
                () => adminRemoveVisitorPasswordAction({ visitor_id: visitorId }),
                'Mot de passe supprimé.',
              );
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Supprimer password
          </Button>
        ) : null}
      </div>
    </div>
  );
}
