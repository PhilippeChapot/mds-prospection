'use client';

/**
 * P11.x — section Authentification partenaire sur la fiche société admin.
 *
 * Affiche le statut auth du contact principal (magic link / password).
 * Actions :
 *   - Renvoyer un magic link (admin + super_admin)
 *   - Envoyer un lien de reset password (admin + super_admin, si password set)
 *   - Supprimer le password (super_admin only)
 *
 * Audit log différencié admin-triggered vs self-triggered (cf. actions).
 */

import { useTransition } from 'react';
import { KeyRound, Mail, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  adminTriggerMagicLinkAction,
  adminTriggerPasswordResetAction,
  adminRemovePartnerPasswordAction,
} from '@/lib/admin/partners/auth-admin-actions';

export interface PartnerAuthData {
  contact_id: string;
  email: string;
  password_set_at: string | null;
}

interface Props {
  partnerAuth: PartnerAuthData | null;
  isSuperAdmin: boolean;
}

export function PartnerAuthSection({ partnerAuth, isSuperAdmin }: Props) {
  const [isPending, startTransition] = useTransition();

  if (!partnerAuth) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="text-md-text-muted size-4 shrink-0" aria-hidden />
          <span className="text-md-text-muted">
            Aucun contact principal trouvé pour cette société.
          </span>
        </div>
      </Card>
    );
  }

  const hasPassword = !!partnerAuth.password_set_at;

  const formattedDate = partnerAuth.password_set_at
    ? new Date(partnerAuth.password_set_at).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  function handleMagicLink() {
    startTransition(async () => {
      const result = await adminTriggerMagicLinkAction({ contact_id: partnerAuth!.contact_id });
      if (result.ok) toast.success('Lien magique envoyé.');
      else toast.error(`Erreur : ${result.error}`);
    });
  }

  function handlePasswordReset() {
    startTransition(async () => {
      const result = await adminTriggerPasswordResetAction({ contact_id: partnerAuth!.contact_id });
      if (result.ok) toast.success('Lien de réinitialisation envoyé.');
      else toast.error(`Erreur : ${result.error}`);
    });
  }

  function handleRemovePassword() {
    if (
      !window.confirm(
        `Forcer la suppression du mot de passe de ${partnerAuth!.email} ?\n\nIl ne pourra plus se connecter par mot de passe jusqu'à en redéfinir un.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await adminRemovePartnerPasswordAction({
        contact_id: partnerAuth!.contact_id,
      });
      if (result.ok) toast.success('Mot de passe supprimé.');
      else toast.error(`Erreur : ${result.error}`);
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-md-blue size-4 shrink-0" aria-hidden />
        <h3 className="text-md-text text-sm font-semibold">🔐 Authentification partenaire</h3>
      </div>

      <div className="space-y-2 text-sm">
        <div className="text-md-text-muted flex items-center justify-between gap-3">
          <span>Email de connexion</span>
          <code className="text-md-text bg-md-bg-soft rounded px-1.5 py-0.5 font-mono text-xs">
            {partnerAuth.email}
          </code>
        </div>

        <div className="text-md-text-muted flex items-center justify-between gap-3">
          <span>Magic link</span>
          <span className="font-medium text-green-700">✅ Toujours actif</span>
        </div>

        <div className="text-md-text-muted flex items-center justify-between gap-3">
          <span>Mot de passe</span>
          {hasPassword ? (
            <span className="text-green-700">✅ Configuré le {formattedDate}</span>
          ) : (
            <span className="italic">— Non configuré</span>
          )}
        </div>
      </div>

      <div className="border-md-border flex flex-wrap gap-2 border-t pt-3">
        <Button
          size="sm"
          variant="outline"
          onClick={handleMagicLink}
          disabled={isPending}
          className="gap-1.5"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Mail className="size-3.5" />
          )}
          Renvoyer lien magique
        </Button>

        {hasPassword && (
          <Button
            size="sm"
            variant="outline"
            onClick={handlePasswordReset}
            disabled={isPending}
            className="gap-1.5"
          >
            <KeyRound className="size-3.5" aria-hidden />
            Envoyer lien de réinit
          </Button>
        )}

        {hasPassword && isSuperAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRemovePassword}
            disabled={isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1.5"
          >
            <Trash2 className="size-3.5" aria-hidden />
            ⚠️ Supprimer le mot de passe
          </Button>
        )}
      </div>
    </Card>
  );
}
