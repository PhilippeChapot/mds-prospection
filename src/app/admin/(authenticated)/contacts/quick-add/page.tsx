import { Sparkles } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { isApolloEnabled } from '@/lib/apollo/client';
import { QuickAddWizard } from './QuickAddWizard';
import { ApolloEnrichSection } from './ApolloEnrichSection';

export const metadata = { title: 'Smart Add — Contacts' };
export const dynamic = 'force-dynamic';

export default async function QuickAddPage() {
  await requireAdminProfile();
  const apolloEnabled = await isApolloEnabled();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="size-6" aria-hidden /> Smart Add Wizard
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Colle un texte brut (signature email, profil LinkedIn, mail, page web) — l&apos;IA Claude
          Haiku extrait person + company, on fuzzy-match avec la base existante, on récupère le
          SIREN INSEE pour les sociétés FR. Tu valides et synchronise Brevo en un clic.
        </p>
      </header>

      {/* P5.x.Apollo — section "Enrichir avec Apollo" (visible si configuré). */}
      {apolloEnabled ? <ApolloEnrichSection /> : null}

      <QuickAddWizard apolloEnabled={apolloEnabled} />
    </div>
  );
}
