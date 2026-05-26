'use client';

/**
 * P5.x.1-bis — bannière welcome affichée sur /admin?invited=1
 *
 * Détecte la langue du user (`profile.language`) pour FR/EN. Affiche son nom,
 * son rôle, et des liens rapides vers les principales pages admin (filtrés
 * par role : super_admin voit aussi /admin/users).
 */

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UserRow, UserRole } from '@/lib/admin/users/queries';

const ROLE_LABEL: Record<'fr' | 'en', Record<UserRole, string>> = {
  fr: {
    admin: 'Administrateur',
    sales: 'Commercial',
    super_admin: 'Super-administrateur',
  },
  en: {
    admin: 'Administrator',
    sales: 'Sales',
    super_admin: 'Super-administrator',
  },
};

export function WelcomeInvitedBanner({ profile }: { profile: UserRow }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const locale: 'fr' | 'en' = profile.language === 'en' ? 'en' : 'fr';
  const roleLabel = ROLE_LABEL[locale][profile.role];
  const displayName = profile.full_name ?? profile.email;

  const title = locale === 'fr' ? `Bienvenue ${displayName} 👋` : `Welcome ${displayName} 👋`;
  const description =
    locale === 'fr'
      ? `Vous êtes maintenant ${roleLabel} sur MediaDays Solutions Prospection. Votre accès est activé.`
      : `You are now ${roleLabel} on MediaDays Solutions Prospection. Your access is activated.`;
  const ctaProspects = locale === 'fr' ? 'Voir les prospects' : 'View prospects';
  const ctaCompanies = locale === 'fr' ? 'Voir les sociétés' : 'View companies';
  const ctaUsers = locale === 'fr' ? 'Gérer les utilisateurs' : 'Manage users';
  const dismissLabel = locale === 'fr' ? 'Fermer' : 'Dismiss';

  return (
    <div
      role="status"
      className="border-md-success/40 bg-md-success/10 flex flex-wrap items-start gap-4 rounded-xl border p-4 shadow-sm"
    >
      <CheckCircle2 className="text-md-success size-6 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="text-md-text text-base font-semibold">{title}</h2>
          <p className="text-md-text-muted text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/admin/prospects">{ctaProspects}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/companies">{ctaCompanies}</Link>
          </Button>
          {profile.role === 'super_admin' && (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/users">{ctaUsers}</Link>
            </Button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-md-text-muted hover:text-md-text shrink-0"
        aria-label={dismissLabel}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
