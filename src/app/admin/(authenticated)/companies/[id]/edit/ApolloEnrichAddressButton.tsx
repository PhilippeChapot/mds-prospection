'use client';

/**
 * P5.x.CompaniesAddressAndTags — bouton "Compléter via Apollo" sur la page edit.
 *
 * Réutilise apolloOrganizationEnrich (P5.x.Apollo) côté server action
 * pour récupérer raw_address + city + postal_code + country + phone.
 * Upsert sans écraser les valeurs déjà non-vides (doctrine
 * external_events_import_doctrine).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { enrichCompanyAddressFromApolloAction } from '@/lib/admin/companies/enrich-actions';

interface Props {
  companyId: string;
  hasWebsite: boolean;
}

export function ApolloEnrichAddressButton({ companyId, hasWebsite }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!hasWebsite) {
    return (
      <p className="text-md-text-muted bg-md-warning/10 border-md-warning/30 rounded-md border p-2 text-xs">
        ⚠ Ajoutez un site web (champ ci-dessus) puis sauvegardez avant d&apos;utiliser
        l&apos;enrichissement Apollo.
      </p>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const r = await enrichCompanyAddressFromApolloAction({ company_id: companyId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data?.fieldsUpdated.length === 0) {
        toast.info('Aucun champ à compléter (déjà à jour).');
        return;
      }
      toast.success(`Apollo a rempli : ${r.data?.fieldsUpdated.join(', ')}`);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {pending ? 'Récupération Apollo…' : '🪄 Compléter via Apollo'}
    </Button>
  );
}
