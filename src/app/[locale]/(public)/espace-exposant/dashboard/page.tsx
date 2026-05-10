import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadDashboardData } from '@/lib/espace-exposant/session';
import type { Locale } from 'next-intl';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Mon Espace Exposant',
};

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function EspaceExposantDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const data = await loadDashboardData(locale);
  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });

  const firstName = data.contact.first_name ?? '';
  const eventsInterest = data.prospect.events_interest ?? [];
  const hasMarseille = eventsInterest.includes('marseille');
  const salonsLabel = hasMarseille
    ? t('registration.salonsParisMarseille')
    : t('registration.salonsParisOnly');

  // Statut affiche : on tente la cle exacte, sinon fallback.
  const statusKey = data.prospect.status as Parameters<typeof t>[0] extends `status.${infer K}`
    ? K
    : string;
  const statusLabel = safeTranslate(t, `status.${statusKey}`, t('status.fallback'));

  // Section devis : visible si sellsy_devis_id != null.
  const hasDevis = !!data.prospect.sellsy_devis_id;
  const devisUrl = data.prospect.sellsy_devis_public_url;
  const devisEmittedAt = data.prospect.sellsy_devis_emitted_at;

  // Section paiement Stripe : visible si payment_path=devis_acompte_stripe.
  const showPayment = data.prospect.payment_path === 'devis_acompte_stripe';
  const acomptePaid = !!data.prospect.acompte_paid_at;
  const paymentLinkUrl = data.prospect.acompte_payment_link_url;
  // paymentLinkExpired pre-calcule cote session.ts (Date.now est interdit
  // pendant le render selon la regle ESLint react-hooks/purity).
  const linkExpired = data.paymentLinkExpired;

  // Acompte = 30% du total TTC s'il existe, sinon fallback estimated_amount * 1.20 * 0.30
  const totalTtc =
    data.prospect.sellsy_devis_total_ttc ??
    (data.prospect.estimated_amount ? data.prospect.estimated_amount * 1.2 : null);
  const acompteAmount =
    data.prospect.acompte_amount_eur ?? (totalTtc ? Math.round(totalTtc * 0.3 * 100) / 100 : null);

  const fmtEur = (n: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-md-magenta mb-1 text-xs font-semibold tracking-widest uppercase">
            MediaDays Solutions 2026
          </p>
          <h1 className="text-md-text text-2xl font-extrabold tracking-tight md:text-3xl">
            {t('greeting', { firstName: firstName || '' })}
          </h1>
          <p className="text-md-text-muted mt-1 text-sm">{t('welcome')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/${locale}/espace-exposant/logout`}>
            <LogOut className="h-4 w-4" aria-hidden />
            {t('logout')}
          </a>
        </Button>
      </header>

      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('registration.section')}</h2>
        <Row label={t('companyLabel')} value={data.company.name} />
        <Row label={t('registration.statusLabel')} value={statusLabel} />
        {data.prospect.pack_code && data.prospect.pack_code !== 'A_DEFINIR' && (
          <Row label={t('registration.packLabel')} value={data.prospect.pack_code} />
        )}
        <Row label={t('registration.salonsLabel')} value={salonsLabel} />
        {data.prospect.estimated_amount != null && (
          <Row
            label={t('registration.amountLabel')}
            value={`${fmtEur(data.prospect.estimated_amount)} HT`}
          />
        )}
      </Card>

      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('devis.section')}</h2>
        {hasDevis ? (
          <>
            {data.prospect.sellsy_devis_number && (
              <Row label={t('devis.numberLabel')} value={data.prospect.sellsy_devis_number} />
            )}
            {devisEmittedAt && (
              <Row label={t('devis.emittedAtLabel')} value={fmtDate(devisEmittedAt)} />
            )}
            {totalTtc != null && <Row label={t('devis.totalTtcLabel')} value={fmtEur(totalTtc)} />}
            {devisUrl && (
              <div className="pt-1">
                <Button asChild variant="outline" size="sm">
                  <a href={devisUrl} target="_blank" rel="noopener noreferrer">
                    {t('devis.cta')} ↗
                  </a>
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-md-text-muted text-sm">{t('devis.noDevis')}</p>
        )}
      </Card>

      {showPayment && (
        <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
          <h2 className="text-md-text text-base font-semibold">{t('payment.section')}</h2>
          {acompteAmount != null && (
            <Row label={t('payment.acompteLabel')} value={fmtEur(acompteAmount)} />
          )}
          {acomptePaid ? (
            <Row
              label=""
              value={`${t('payment.statusPaid')} ${data.prospect.acompte_paid_at ? `— ${fmtDate(data.prospect.acompte_paid_at)}` : ''}`}
            />
          ) : linkExpired ? (
            <p className="text-md-warning text-sm">{t('payment.expired')}</p>
          ) : paymentLinkUrl ? (
            <>
              <Row label="" value={t('payment.statusPending')} />
              <div className="pt-1">
                <Button asChild className="bg-md-magenta hover:bg-md-magenta-soft">
                  <a href={paymentLinkUrl} target="_blank" rel="noopener noreferrer">
                    {t('payment.cta')} ↗
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-md-text-muted text-sm">{t('payment.noPath')}</p>
          )}
        </Card>
      )}

      <Card className="border-md-border bg-md-bg-soft space-y-1 p-5 text-sm shadow-sm sm:p-6">
        <p className="text-md-text font-semibold">{t('contact.section')}</p>
        <p className="text-md-text-muted">
          {t('contact.body')}{' '}
          <a href={`mailto:${t('contact.email')}`} className="text-md-blue hover:underline">
            {t('contact.email')}
          </a>
        </p>
      </Card>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!label) {
    return <p className="text-md-text text-sm">{value}</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="text-md-text-muted">{label}</span>
      <span className="text-md-text font-medium">{value}</span>
    </div>
  );
}

/**
 * Tente t(key), retourne fallback si la cle n'existe pas (next-intl
 * throw sur cle inconnue en mode strict).
 */
function safeTranslate(t: (key: string) => string, key: string, fallback: string): string {
  try {
    return t(key);
  } catch {
    return fallback;
  }
}
