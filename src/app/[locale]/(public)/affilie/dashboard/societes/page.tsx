/**
 * Section "Mes societes" — Espace Affilie — P7.x.1.F
 *
 * Tableau des affiliate_claims de l'affilie connecte, tri pending > active
 * > rejected. Bouton "+ Declarer une societe demarchee" en haut qui ouvre
 * une modale (form serveur).
 *
 * Doctrine RGPD : on affiche le nom + statut + commission liee, mais
 * jamais d'email/telephone contact prospect.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { listClaimsForAffiliate } from '@/lib/affiliate-claims/queries';
import { SocietesTable } from './SocietesTable';
import { DeclareSocieteButton } from './DeclareSocieteButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes sociétés · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieSocietesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.societes' });

  const claims = await listClaimsForAffiliate(affiliateId);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <DeclareSocieteButton locale={locale} />
      </header>

      <SocietesTable claims={claims} locale={locale} />
    </section>
  );
}
