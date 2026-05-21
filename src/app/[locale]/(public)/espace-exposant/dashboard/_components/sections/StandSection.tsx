/**
 * P5.x.17 — section "Mon stand" de l'Espace Exposant V1.3.
 *
 * Sert de page d'accueil (la racine /dashboard redirige ici). Regroupe :
 *   - Synthese inscription (compagnie, statut, pack, salons, montant)
 *   - Booth assignement (numero de stand + plan de salle PDF)
 *   - Section devis Sellsy (si emis)
 *   - Section paiement Stripe acompte (si payment_path=devis_acompte_stripe)
 *
 * Volontairement riche : c'est la "home" du dashboard donc on resume
 * l'etat de la commande + les actions a faire en priorite.
 */

import { getTranslations } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlanCanvaInteractive } from '@/components/admin/plan/PlanCanvaInteractive';
import { Row } from '../Row';
import { makeFormatters } from '../section-loader';
import type { SectionProps } from './types';

export async function StandSection({ data, locale }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'espaceExposant.dashboard' });
  const { fmtEur, fmtDate } = makeFormatters(locale);

  const eventsInterest = data.prospect.events_interest ?? [];
  const hasMarseille = eventsInterest.includes('marseille');
  const salonsLabel = hasMarseille
    ? t('registration.salonsParisMarseille')
    : t('registration.salonsParisOnly');

  // Statut affiche : safe-translate.
  const statusKey = data.prospect.status as Parameters<typeof t>[0] extends `status.${infer K}`
    ? K
    : string;
  const statusLabel = safeTranslate(t, `status.${statusKey}`, t('status.fallback'));

  // Devis section visible si sellsy_devis_id != null.
  const hasDevis = !!data.prospect.sellsy_devis_id;
  const devisUrl = data.prospect.sellsy_devis_public_url;
  const devisEmittedAt = data.prospect.sellsy_devis_emitted_at;

  // Payment section visible si payment_path=devis_acompte_stripe.
  const showPayment = data.prospect.payment_path === 'devis_acompte_stripe';
  const acomptePaid = !!data.prospect.acompte_paid_at;
  const paymentLinkUrl = data.prospect.acompte_payment_link_url;
  const linkExpired = data.paymentLinkExpired;

  const totalTtc =
    data.prospect.sellsy_devis_total_ttc ??
    (data.prospect.estimated_amount ? data.prospect.estimated_amount * 1.2 : null);
  const acompteAmount =
    data.prospect.acompte_amount_eur ?? (totalTtc ? Math.round(totalTtc * 0.3 * 100) / 100 : null);

  return (
    <div className="space-y-5">
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

      {/* Booth (P5.x.10) */}
      <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
        <h2 className="text-md-text text-base font-semibold">{t('booth.section')}</h2>
        {data.prospect.booth_assignment ? (
          <div className="flex items-center gap-3">
            <MapPin className="text-md-blue size-5 shrink-0" aria-hidden />
            <div>
              <div className="text-md-text text-lg font-bold">{data.prospect.booth_assignment}</div>
              {data.prospect.booth_assigned_at ? (
                <div className="text-md-text-muted text-xs">
                  {t('booth.assignedOn', { date: fmtDate(data.prospect.booth_assigned_at) })}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-md-text-muted text-sm">{t('booth.notYet')}</p>
        )}
        {data.documents.floorPlanPdfUrl ? (
          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <a href={data.documents.floorPlanPdfUrl} target="_blank" rel="noopener noreferrer">
                {t('booth.seeFloorPlan')} ↗
              </a>
            </Button>
          </div>
        ) : null}
      </Card>

      {/* P6.x.3 — Plan visuel interactif (Le Notre) avec stand de l'exposant
          mis en evidence (ring rose). Affiche aussi les voisins (tooltip
          au survol). Cache si pas de stand assigne (rien a "highlight"). */}
      {data.myStand && data.leNotreStands.length > 0 ? (
        <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
          <h2 className="text-md-text text-base font-semibold">{t('booth.planTitle')}</h2>
          <p className="text-md-text-muted text-sm">
            {t('booth.planHelp', { number: data.myStand.number })}
          </p>
          <PlanCanvaInteractive
            mode="exposant"
            stands={data.leNotreStands}
            highlightedStandId={data.myStand.id}
          />
        </Card>
      ) : null}

      {/* Devis Sellsy */}
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

      {/* Paiement Stripe (acompte) */}
      {showPayment && (
        <Card className="border-md-border space-y-3 p-5 shadow-sm sm:p-6">
          <h2 className="text-md-text text-base font-semibold">{t('payment.section')}</h2>
          {acompteAmount != null && (
            <Row label={t('payment.acompteLabel')} value={fmtEur(acompteAmount)} />
          )}
          {acomptePaid ? (
            <Row
              label=""
              value={`${t('payment.statusPaid')} ${
                data.prospect.acompte_paid_at ? `— ${fmtDate(data.prospect.acompte_paid_at)}` : ''
              }`}
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
