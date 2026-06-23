import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadSectionData } from '../_components/section-loader';
import { DocumentsSection } from '../_components/sections/DocumentsSection';
import { DocumentRequestsPanel } from '../_components/sections/DocumentRequestsPanel';
import { listMyDocumentRequests } from '@/lib/espace-partenaire/document-requests-queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes documents — Espace Partenaire' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function DocumentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as 'fr' | 'en';
  const data = await loadSectionData(loc);
  const myRequests = await listMyDocumentRequests(loc);

  return (
    <div className="space-y-6">
      <DocumentsSection data={data} locale={loc} />
      <DocumentRequestsPanel
        locale={loc}
        myRequests={myRequests}
        proformaEmitted={Boolean(data.prospect.sellsy_proforma_number)}
        invoiceEmitted={Boolean(data.prospect.sellsy_invoice_number)}
      />
    </div>
  );
}
