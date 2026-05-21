/**
 * Section Paiements — Espace Affilie — P7.x.1.B
 *
 * Tableau historique des commissions (lifetime). Trois statuts :
 *   - 'due'             : validee (acompte_paid_at != null), virement a venir
 *   - 'paid'            : virement effectue (commission_payment_reference set)
 *   - 'not_applicable'  : prospect attribue mais pas encore converti
 *
 * Filtre client-side (segments All / Due / Paid). Pas de pagination V1 :
 * volume cible < 100 lignes par affilie.
 *
 * RGPD : on n'expose JAMAIS les emails/telephones des contacts du prospect
 * (cf. doctrine `loadAffilieDashboardData`). Seul le nom de l'entreprise +
 * status sont remontes.
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { loadAffilieDashboardData } from '@/lib/affilie/dashboard-data';
import { Card } from '@/components/ui/card';
import { PaiementsTable } from './PaiementsTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paiements · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffiliePaiementsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.paiements' });

  const { commissions } = await loadAffilieDashboardData(affiliateId);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      {commissions.length === 0 ? (
        <Card className="border-md-border bg-md-bg-soft border-dashed p-5 text-sm shadow-none">
          <p className="text-md-text-muted">{t('empty')}</p>
        </Card>
      ) : (
        <PaiementsTable commissions={commissions} locale={locale} />
      )}
    </section>
  );
}
