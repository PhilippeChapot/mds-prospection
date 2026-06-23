import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  requireEspacePartenaireSession,
  getPartnerWriteContext,
} from '@/lib/espace-partenaire/session';
import { canPlaceOrder } from '@/lib/espace-partenaire/resolve-prospect';
import {
  getOrderableCatalog,
  getProspectForPartenaire,
} from '@/lib/espace-partenaire/supplementary-orders/queries';
import {
  canAccessSupplementaryOrders,
  type EligibilityCheck,
} from '@/lib/espace-partenaire/supplementary-orders/eligibility';
import { OrderCatalog } from './_components/OrderCatalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commander en plus — Espace Partenaire' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function CommanderPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { prospectId } = await requireEspacePartenaireSession(locale);

  const [prospect, catalog] = await Promise.all([
    getProspectForPartenaire(prospectId),
    getOrderableCatalog(),
  ]);

  // P11.x : un viewer (grant lecture seule) ne peut pas commander.
  const writeCtx = await getPartnerWriteContext();
  if (writeCtx && !canPlaceOrder(writeCtx.role)) {
    return <ViewerNotice locale={locale} />;
  }

  const eligibility = canAccessSupplementaryOrders(prospect);
  // P6.x.7 — au lieu de rediriger silencieusement vers /dashboard?... (jamais
  // lu par aucune page côté receveur), on rend la page en mode ineligible
  // avec un message clair. L'utilisateur comprend pourquoi il ne peut pas
  // commander et garde la possibilité de revenir vers son devis.
  if (!eligibility.eligible) {
    return (
      <IneligibleNotice
        locale={locale}
        eligibility={eligibility}
        prospectStatus={prospect?.status ?? null}
      />
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

/** P11.x : viewer (grant lecture seule) ne peut pas commander. */
function ViewerNotice({ locale }: { locale: Locale }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-md-blue-deep text-2xl font-bold">
          Vous avez oublié quelque chose ?
        </h1>
      </header>
      <Card className="border-md-border space-y-4 p-6 shadow-sm sm:p-8">
        <div className="bg-md-blue/10 text-md-blue mx-auto flex size-12 items-center justify-center rounded-full">
          <Lock className="size-6" aria-hidden />
        </div>
        <h2 className="text-md-text text-center text-lg font-semibold">Accès en lecture seule</h2>
        <p className="text-md-text-muted mx-auto max-w-md text-center text-sm leading-relaxed">
          Vous n&apos;avez pas les droits pour passer commande. Demandez à un administrateur de
          votre compte (owner ou collaborateur) de le faire.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild size="sm">
            <Link href={`/${locale}/espace-partenaire/dashboard/stand`}>Retour au dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

function IneligibleNotice({
  locale,
  eligibility,
  prospectStatus,
}: {
  locale: Locale;
  eligibility: Extract<EligibilityCheck, { eligible: false }>;
  prospectStatus: string | null;
}) {
  // Message contextuel selon la raison.
  const title =
    eligibility.reasonCode === 'no_prospect'
      ? 'Compte introuvable'
      : eligibility.reasonCode === 'wrong_status'
        ? 'Commandes complémentaires temporairement indisponibles'
        : 'Devis pas encore signé';
  const explanation =
    eligibility.reasonCode === 'not_signed'
      ? 'Vous pourrez ajouter des options et sponsorings complémentaires dès que votre devis principal sera signé. Une fois la signature reçue, cet espace sera débloqué automatiquement.'
      : eligibility.reason;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-md-blue-deep text-2xl font-bold">
          Vous avez oublié quelque chose ?
        </h1>
      </header>

      <Card className="border-md-border space-y-4 p-6 shadow-sm sm:p-8">
        <div className="bg-md-blue/10 text-md-blue mx-auto flex size-12 items-center justify-center rounded-full">
          <Lock className="size-6" aria-hidden />
        </div>
        <h2 className="text-md-text text-center text-lg font-semibold">{title}</h2>
        <p className="text-md-text-muted mx-auto max-w-md text-center text-sm leading-relaxed">
          {explanation}
        </p>
        {prospectStatus && eligibility.reasonCode === 'wrong_status' ? (
          <p className="text-md-text-muted text-center text-xs">
            Statut actuel :{' '}
            <code className="bg-md-bg-soft rounded px-1.5 py-0.5">{prospectStatus}</code>
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${locale}/espace-partenaire/dashboard/documents`}>Voir mon devis</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/${locale}/espace-partenaire/dashboard/stand`}>Retour au dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
