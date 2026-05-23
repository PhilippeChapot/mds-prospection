'use client';

/**
 * P7.x.1.D — Banner d'info au-dessus des KPI (dashboard affilie).
 *
 * Explique la regle d'exclusion PRS exhibitors + ouvre une modale
 * shadcn Dialog avec la liste des societes exclues (nom + domaine,
 * pas d'email ni telephone — RGPD).
 *
 * Composant client : le modal Dialog est interactif. La liste
 * `excludedCompanies` est chargee cote serveur dans la page stats
 * et passee en prop (un seul fetch DB par render).
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ExcludedCompany } from '@/lib/affiliates/excluded-companies';

interface Props {
  excludedCompanies: ExcludedCompany[];
}

export function CommissionExclusionBanner({ excludedCompanies }: Props) {
  const t = useTranslations('espaceAffilie.dashboard.exclusion');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return excludedCompanies;
    return excludedCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.primaryDomain?.toLowerCase().includes(q) ?? false),
    );
  }, [excludedCompanies, search]);

  return (
    <>
      <div className="border-md-blue/30 bg-md-blue/5 text-md-text rounded-md border p-3 text-sm">
        <div className="flex items-start gap-2">
          <Info className="text-md-blue mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <p>
              <strong>{t('title')}</strong> {t('body')}
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-md-blue mt-1 text-xs font-semibold underline-offset-2 hover:underline"
            >
              {t('seeListLink', { count: excludedCompanies.length })}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('modalTitle')}</DialogTitle>
            <DialogDescription>{t('modalDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="border-md-border max-h-80 overflow-y-auto rounded-md border">
              {filtered.length === 0 ? (
                <p className="text-md-text-muted p-4 text-center text-xs">
                  {search ? t('noResults') : t('empty')}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-md-text-muted text-[10px] font-bold tracking-wider uppercase">
                    <tr>
                      <th className="px-3 py-2">{t('th.name')}</th>
                      <th className="px-3 py-2">{t('th.domain')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-md-border border-t">
                        <td className="text-md-text px-3 py-2 font-medium">{c.name}</td>
                        <td className="text-md-text-muted px-3 py-2 font-mono text-xs">
                          {c.primaryDomain ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="text-md-text-muted text-[11px]">
              {t('total', { count: excludedCompanies.length })}
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <X className="mr-1.5 size-3.5" aria-hidden /> {t('close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
