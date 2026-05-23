'use client';

/**
 * P7.x.1.F — Tableau "Mes societes" affilie.
 *
 * 3 sources avec badges + statut pills :
 *   - 🍪 Cookie tracking      (cookie_tracking)
 *   - 📝 Declaree par societe (declared_by_company, signup wizard)
 *   - 👤 Declaree par moi     (declared_by_affiliate, form affilie)
 *
 * Status :
 *   - ⏳ Validation admin (pending)
 *   - ✅ Active           (active)
 *   - ❌ Rejetee          (rejected)
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AffilieClaimRow } from '@/lib/affiliate-claims/queries';

interface Props {
  claims: AffilieClaimRow[];
  locale: string;
}

export function SocietesTable({ claims, locale }: Props) {
  const t = useTranslations('espaceAffilie.dashboard.societes');
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

  if (claims.length === 0) {
    return (
      <Card className="border-md-border bg-md-bg-soft border-dashed p-5 text-sm shadow-none">
        <p className="text-md-text-muted">{t('empty')}</p>
      </Card>
    );
  }

  return (
    <Card className="border-md-border bg-card overflow-hidden p-0 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">{t('th.company')}</th>
              <th className="px-4 py-3">{t('th.source')}</th>
              <th className="px-4 py-3">{t('th.status')}</th>
              <th className="px-4 py-3">{t('th.declaredAt')}</th>
              <th className="px-4 py-3 text-right">{t('th.commission')}</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} className="border-md-border hover:bg-muted/20 border-t">
                <td className="text-md-text px-4 py-3 font-medium">
                  {c.resolvedCompanyName ?? c.declaredCompanyName ?? '—'}
                  {c.declaredCompanyWebsite ? (
                    <div className="text-md-text-muted font-mono text-[11px]">
                      {c.declaredCompanyWebsite}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={c.source} t={t} />
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={c.status} t={t} />
                  {c.status === 'rejected' && c.rejectedReason ? (
                    <div className="text-md-text-muted mt-1 text-[10px] italic">
                      {c.rejectedReason}
                    </div>
                  ) : null}
                </td>
                <td className="text-md-text-muted px-4 py-3 text-xs">
                  {fmtDate.format(new Date(c.declaredAt))}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">
                  {c.commissionEurHt != null ? (
                    <span className="text-md-text font-semibold">
                      {fmtEur.format(c.commissionEurHt)}
                    </span>
                  ) : (
                    <span className="text-md-text-muted">—</span>
                  )}
                  {c.commissionStatus ? (
                    <div className="text-md-text-muted mt-0.5 text-[10px] uppercase">
                      {c.commissionStatus === 'paid'
                        ? t('commissionPaid')
                        : c.commissionStatus === 'due'
                          ? t('commissionDue')
                          : '—'}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SourceBadge({
  source,
  t,
}: {
  source: AffilieClaimRow['source'];
  t: (key: string) => string;
}) {
  const map: Record<
    AffilieClaimRow['source'],
    { emoji: string; label: string; className: string }
  > = {
    cookie_tracking: {
      emoji: '🍪',
      label: t('source.cookieTracking'),
      className: 'bg-blue-100 text-blue-800',
    },
    declared_by_company: {
      emoji: '📝',
      label: t('source.declaredByCompany'),
      className: 'bg-emerald-100 text-emerald-800',
    },
    declared_by_affiliate: {
      emoji: '👤',
      label: t('source.declaredByAffiliate'),
      className: 'bg-amber-100 text-amber-800',
    },
  };
  const cfg = map[source];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        cfg.className,
      )}
    >
      <span aria-hidden>{cfg.emoji}</span> {cfg.label}
    </span>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: AffilieClaimRow['status'];
  t: (key: string) => string;
}) {
  if (status === 'active') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        ✅ {t('status.active')}
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
        ⏳ {t('status.pending')}
      </span>
    );
  }
  return (
    <span className="text-md-text-muted inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
      ❌ {t('status.rejected')}
    </span>
  );
}
