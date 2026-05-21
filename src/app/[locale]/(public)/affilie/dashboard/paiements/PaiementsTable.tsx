'use client';

/**
 * P7.x.1.B — Tableau commissions affilie avec filtre client-side.
 *
 * Status pills :
 *   - 'due'             -> orange (a percevoir)
 *   - 'paid'            -> vert (paye, avec reference virement)
 *   - 'not_applicable'  -> gris (prospect pas converti)
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AffilieCommissionRow, CommissionStatus } from '@/lib/affilie/dashboard-data';

type Filter = 'all' | 'due' | 'paid';

interface Props {
  commissions: AffilieCommissionRow[];
  locale: string;
}

export function PaiementsTable({ commissions, locale }: Props) {
  const t = useTranslations('espaceAffilie.dashboard.paiements');
  const [filter, setFilter] = useState<Filter>('all');

  const fmtEur = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  const fmtDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return commissions;
    if (filter === 'due') return commissions.filter((c) => c.commissionStatus === 'due');
    return commissions.filter((c) => c.commissionStatus === 'paid');
  }, [commissions, filter]);

  const counts = useMemo(
    () => ({
      all: commissions.length,
      due: commissions.filter((c) => c.commissionStatus === 'due').length,
      paid: commissions.filter((c) => c.commissionStatus === 'paid').length,
    }),
    [commissions],
  );

  return (
    <Card className="border-md-border bg-card overflow-hidden p-0 shadow-sm">
      <div className="border-md-border flex flex-wrap items-center gap-2 border-b p-3">
        <FilterPill
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label={`${t('filterAll')} (${counts.all})`}
        />
        <FilterPill
          active={filter === 'due'}
          onClick={() => setFilter('due')}
          label={`${t('filterDue')} (${counts.due})`}
        />
        <FilterPill
          active={filter === 'paid'}
          onClick={() => setFilter('paid')}
          label={`${t('filterPaid')} (${counts.paid})`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">{t('th.convertedAt')}</th>
              <th className="px-4 py-3">{t('th.company')}</th>
              <th className="px-4 py-3 text-right">{t('th.devisTtc')}</th>
              <th className="px-4 py-3 text-right">{t('th.commission')}</th>
              <th className="px-4 py-3">{t('th.status')}</th>
              <th className="px-4 py-3">{t('th.reference')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-md-text-muted px-4 py-6 text-center text-xs">
                  —
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.prospectId} className="border-md-border hover:bg-muted/20 border-t">
                  <td className="text-md-text-muted px-4 py-3 text-xs">
                    {row.convertedAt ? fmtDate.format(new Date(row.convertedAt)) : '—'}
                  </td>
                  <td className="text-md-text px-4 py-3 font-medium">{row.companyName}</td>
                  <td className="text-md-text-muted px-4 py-3 text-right text-xs">
                    {row.devisTotalTtc != null ? fmtEur.format(row.devisTotalTtc) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {row.commissionEurHt != null ? fmtEur.format(row.commissionEurHt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.commissionStatus} t={t} />
                  </td>
                  <td className="text-md-text-muted px-4 py-3 font-mono text-xs">
                    {row.commissionPaymentReference ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[11px] font-semibold transition',
        active
          ? 'bg-md-magenta text-white'
          : 'border-md-border text-md-text hover:bg-muted border bg-white',
      )}
    >
      {label}
    </button>
  );
}

function StatusPill({ status, t }: { status: CommissionStatus; t: (key: string) => string }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        {t('statusPaid')}
      </span>
    );
  }
  if (status === 'due') {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
        {t('statusDue')}
      </span>
    );
  }
  return (
    <span className="text-md-text-muted inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
      {t('statusNotApplicable')}
    </span>
  );
}
