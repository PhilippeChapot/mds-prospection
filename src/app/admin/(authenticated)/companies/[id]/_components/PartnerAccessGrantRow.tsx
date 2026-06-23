'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Mail, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  resendPartnerMagicLinkAction,
  revokePartnerAccessAction,
} from '@/lib/admin/partner-access/grant-actions';

export interface GrantRowData {
  id: string;
  role: 'owner' | 'collaborator' | 'viewer';
  granted_at: string;
  last_login_at: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  granted_by_name: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  owner: '👑 Owner',
  collaborator: '🤝 Collab',
  viewer: '👁 Viewer',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PartnerAccessGrantRow({
  grant,
  isSuperAdmin,
}: {
  grant: GrantRowData;
  isSuperAdmin: boolean;
}) {
  const [isPending, startTx] = useTransition();

  function handleResend() {
    startTx(async () => {
      const r = await resendPartnerMagicLinkAction(grant.contact.id);
      if (r.success) toast.success('Magic link envoyé.');
      else toast.error(r.error);
    });
  }

  function handleRevoke() {
    if (
      !window.confirm(
        `Révoquer l'accès de ${grant.contact.first_name ?? ''} ${grant.contact.last_name ?? ''} (${grant.contact.email}) ?\n\nCette action est irréversible — vous devrez recréer un grant pour le réactiver.`,
      )
    )
      return;
    startTx(async () => {
      const r = await revokePartnerAccessAction(grant.id);
      if (r.success) toast.success('Accès révoqué.');
      else toast.error(r.error);
    });
  }

  const displayName =
    [grant.contact.first_name, grant.contact.last_name].filter(Boolean).join(' ') ||
    grant.contact.email;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-md-text text-sm font-medium">{displayName}</span>
          <span className="bg-md-bg-soft text-md-text-muted rounded px-1.5 py-0.5 text-xs">
            {ROLE_LABEL[grant.role] ?? grant.role}
          </span>
        </div>
        <span className="text-md-text-muted font-mono text-xs">{grant.contact.email}</span>
        <span className="text-md-text-muted text-xs">
          Accès accordé le {fmtDate(grant.granted_at)}
          {grant.granted_by_name ? ` par ${grant.granted_by_name}` : ''}
          {' · '}
          {grant.last_login_at ? `Connecté le ${fmtDate(grant.last_login_at)}` : 'Jamais connecté'}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={isPending}
          className="gap-1.5"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Mail className="size-3.5" />
          )}
          Renvoyer link
        </Button>

        {isSuperAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRevoke}
            disabled={isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1.5"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Révoquer
          </Button>
        )}
      </div>
    </div>
  );
}
