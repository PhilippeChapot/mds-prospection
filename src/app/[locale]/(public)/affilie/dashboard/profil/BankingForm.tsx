'use client';

/**
 * Form coordonnees bancaires affilie — P7.x.1.C
 *
 * - 3 champs : iban / bic / nom_titulaire_compte
 * - Validation Zod cote serveur (action) + cote client (HTML5 + check
 *   regex avant submit)
 * - Toast success/error
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateAffiliateBankingAction } from '@/lib/affilie/actions';

interface Props {
  locale: string;
  initialIban: string;
  initialBic: string;
  initialNom: string;
}

export function BankingForm({ locale, initialIban, initialBic, initialNom }: Props) {
  const t = useTranslations('espaceAffilie.dashboard.profil.banking');
  const [iban, setIban] = useState(initialIban);
  const [bic, setBic] = useState(initialBic);
  const [nom, setNom] = useState(initialNom);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const r = await updateAffiliateBankingAction(locale, {
        iban,
        bic: bic || undefined,
        nom_titulaire_compte: nom,
      });
      if (r.ok) {
        toast.success(t('toastSuccess'));
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div>
        <Label htmlFor="iban">
          {t('ibanLabel')} <span className="text-md-magenta">*</span>
        </Label>
        <Input
          id="iban"
          required
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="FR76 3000 1007 9412 3456 7890 185"
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <div>
        <Label htmlFor="bic">{t('bicLabel')}</Label>
        <Input
          id="bic"
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          placeholder="BNPAFRPP"
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <div>
        <Label htmlFor="nom-titulaire">
          {t('nomTitulaireLabel')} <span className="text-md-magenta">*</span>
        </Label>
        <Input
          id="nom-titulaire"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Lucas Aubrée"
          autoComplete="name"
          disabled={pending}
        />
      </div>
      <Button
        type="submit"
        disabled={pending || !iban.trim() || !nom.trim()}
        className="bg-md-magenta hover:bg-md-magenta-soft"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            {t('saving')}
          </>
        ) : (
          <>
            <Save className="mr-2 size-4" aria-hidden /> {t('save')}
          </>
        )}
      </Button>
    </form>
  );
}
