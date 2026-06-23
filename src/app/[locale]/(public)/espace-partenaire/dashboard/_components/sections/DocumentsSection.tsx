/**
 * P5.x.17 — section "Mes documents" de l'Espace Partenaire V1.3.
 *
 * Liste 4 docs : guide partenaire, plan de salle, devis Sellsy, facture Sellsy.
 * Chaque doc affiche un CTA download ou un fallback "pas encore dispo".
 */

import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { SectionProps } from './types';

export async function DocumentsSection({ data, locale }: SectionProps) {
  const t = await getTranslations({ locale, namespace: 'espacePartenaire.dashboard' });

  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
      <h2 className="text-md-text text-base font-semibold">{t('documents.section')}</h2>

      <DocumentRow
        label={t('documents.guide')}
        url={data.documents.guidePdfUrl}
        ctaLabel={t('documents.guideDownload')}
        fallback={t('documents.guideComingSoon')}
      />
      <DocumentRow
        label={t('documents.floorPlan')}
        url={data.documents.floorPlanPdfUrl}
        ctaLabel={t('documents.floorPlanDownload')}
        fallback={t('documents.guideComingSoon')}
      />
      <DocumentRow
        label={t('documents.devis')}
        url={data.documents.devisUrl}
        ctaLabel={t('documents.devisCta')}
        fallback={t('documents.devisNotYet')}
      />
      <DocumentRow
        label={t('documents.proforma')}
        url={data.documents.proformaUrl}
        ctaLabel={t('documents.proformaCta')}
        fallback={t('documents.proformaNotYet')}
      />
      <DocumentRow
        label={t('documents.invoice')}
        url={data.documents.invoiceUrl}
        ctaLabel={t('documents.invoiceCta')}
        fallback={t('documents.invoiceNotYet')}
      />
    </Card>
  );
}

function DocumentRow({
  label,
  url,
  ctaLabel,
  fallback,
}: {
  label: string;
  url: string | null;
  ctaLabel: string;
  fallback: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-md-text font-medium">{label}</span>
      {url ? (
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {ctaLabel} ↗
          </a>
        </Button>
      ) : (
        <span className="text-md-text-muted text-xs italic">{fallback}</span>
      )}
    </div>
  );
}
