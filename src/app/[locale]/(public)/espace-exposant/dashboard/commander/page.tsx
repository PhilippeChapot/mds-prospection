import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { Locale } from 'next-intl';
import { requireEspaceExposantSession } from '@/lib/espace-exposant/session';
import {
  getOrderableCatalog,
  getProspectForExposant,
} from '@/lib/espace-exposant/supplementary-orders/queries';
import { canAccessSupplementaryOrders } from '@/lib/espace-exposant/supplementary-orders/eligibility';
import { OrderCatalog } from './_components/OrderCatalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commander en plus — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function CommanderPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { prospectId } = await requireEspaceExposantSession(locale);

  const [prospect, catalog] = await Promise.all([
    getProspectForExposant(prospectId),
    getOrderableCatalog(),
  ]);

  const eligibility = canAccessSupplementaryOrders(prospect);
  if (!eligibility.eligible) {
    // Redirect avec query param banner — la page dashboard root peut afficher
    // un message explicatif. Pour l'instant, redirect simple avec reason.
    redirect(
      `/${locale}/espace-exposant/dashboard?supplementary=ineligible&reason=${eligibility.reasonCode}`,
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-md-blue-deep text-2xl font-bold">
          Vous avez oublié quelque chose ?
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Complétez votre commande avec des options, services ou sponsorings additionnels. Paiement
          en ligne sécurisé, facture envoyée automatiquement après paiement.
        </p>
      </header>

      <OrderCatalog catalog={catalog} />
    </div>
  );
}
