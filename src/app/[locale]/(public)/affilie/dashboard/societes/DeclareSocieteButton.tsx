'use client';

/**
 * P7.x.1.F — Bouton "+ Declarer une societe demarchee" + modale form.
 *
 * Affiche un Dialog shadcn avec 3 champs (nom + website + notes) puis
 * POST vers declareCompanyByAffiliateAction. Affiche un feedback toast
 * + statut (matched company OR pas de match).
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { declareCompanyByAffiliateAction } from '@/lib/affiliate-claims/actions';

interface Props {
  locale: string;
}

export function DeclareSocieteButton({ locale }: Props) {
  const t = useTranslations('espaceAffilie.dashboard.societes.declare');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setWebsite('');
    setNotes('');
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const r = await declareCompanyByAffiliateAction(locale, {
        declared_company_name: name,
        declared_company_website: website || undefined,
        notes_affiliate: notes || undefined,
      });
      if (r.ok) {
        toast.success(t('toastSuccess'));
        if (r.data.matchedCompanyName) {
          toast.info(t('toastMatched', { company: r.data.matchedCompanyName }));
        }
        reset();
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-md-magenta hover:bg-md-magenta-soft gap-1.5"
      >
        <Plus className="size-4" aria-hidden /> {t('cta')}
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('modalTitle')}</DialogTitle>
          <DialogDescription>{t('modalDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div>
            <Label htmlFor="declare-name">
              {t('nameLabel')} <span className="text-md-magenta">*</span>
            </Label>
            <Input
              id="declare-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="declare-website">{t('websiteLabel')}</Label>
            <Input
              id="declare-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="declare-notes">{t('notesLabel')}</Label>
            <Textarea
              id="declare-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              disabled={pending}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={pending || name.trim().length < 2}
              className="bg-md-magenta hover:bg-md-magenta-soft"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> {t('submitting')}
                </>
              ) : (
                t('submit')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
