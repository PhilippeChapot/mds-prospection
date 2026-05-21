/**
 * Section Profil — Espace Affilie — P7.x.1.C
 *
 * 2 sections :
 *   - Identite (lecture seule) : display_name, contact_email, type,
 *     commission_percent. Email locked (changement = re-auth via admin).
 *   - Coordonnees bancaires (editable) : iban, bic, nom_titulaire_compte.
 *     Submit via server action updateAffiliateBankingAction.
 *
 * RGPD : les coordonnees bancaires sont sensibles. On les rend en clair
 * dans le form (l'affilie a besoin de les voir pour les corriger) mais
 * jamais dans les emails (helper maskIban pour les confirmations).
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { loadAffilieDashboardData } from '@/lib/affilie/dashboard-data';
import { Card } from '@/components/ui/card';
import { BankingForm } from './BankingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon profil · Affilié MDS 2026' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffilieProfilPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);
  const t = await getTranslations({ locale, namespace: 'espaceAffilie.dashboard.profil' });

  const { profile } = await loadAffilieDashboardData(affiliateId);

  const typeLabel = profile.type === 'media' ? t('typeMedia') : t('typeReferral');

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-md-text text-xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <h3 className="text-md-text text-base font-semibold">{t('identity.section')}</h3>
        <dl className="text-sm">
          <Row label={t('identity.displayName')} value={profile.displayName} />
          <Row
            label={t('identity.email')}
            value={profile.contactEmail ?? '—'}
            hint={t('identity.emailLocked')}
          />
          <Row label={t('identity.type')} value={typeLabel} />
          <Row
            label={t('identity.commissionPercent')}
            value={`${profile.commissionPercent.toFixed(2)} %`}
          />
        </dl>
      </Card>

      <Card className="border-md-border bg-card space-y-3 p-5 shadow-sm sm:p-6">
        <h3 className="text-md-text text-base font-semibold">{t('banking.section')}</h3>
        <p className="text-md-text-muted text-xs">{t('banking.help')}</p>
        <BankingForm
          locale={locale}
          initialIban={profile.iban ?? ''}
          initialBic={profile.bic ?? ''}
          initialNom={profile.nomTitulaireCompte ?? ''}
        />
      </Card>
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-md-border flex flex-col gap-1 border-b py-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <dt className="text-md-text-muted text-xs font-semibold">{label}</dt>
      <dd className="text-md-text text-sm">
        {value}
        {hint ? (
          <span className="text-md-text-muted ml-2 text-[10px] font-semibold uppercase">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
