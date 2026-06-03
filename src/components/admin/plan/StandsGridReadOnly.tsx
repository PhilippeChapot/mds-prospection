'use client';

/**
 * P6.x.3-ter — Grid 2D read-only pour les partenaires (vue exploration salon).
 *
 * Reproduit visuellement le PlanGrid admin (8 rangées A-H × 11 colonnes 10..0)
 * mais SANS drag-drop, SANS actions admin. Affiche :
 *   - Couleur status (libre/réservé/payé/bloqué)
 *   - Highlight rose ring si stand de l'partenaire
 *   - Nom company conditionnel à `company_public_visibility` (RGPD opt-out)
 *
 * Aucune PII (contact_email/phone/SIRET) n'est jamais utilisée — props limitées
 * à `StandPublicView` (cf. `lib/espace-partenaire/stands-public-view.ts`).
 */

import { Fragment, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { StandPublicView } from '@/lib/espace-partenaire/stands-public-view';

const PLAN_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const PLAN_COLS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as const;

interface Props {
  stands: StandPublicView[];
  highlightedStandId?: string;
}

export function StandsGridReadOnly({ stands, highlightedStandId }: Props) {
  const t = useTranslations('PartenaireDashboard');
  const byNumber = useMemo(() => {
    const m = new Map<string, StandPublicView>();
    for (const s of stands) m.set(s.number, s);
    return m;
  }, [stands]);

  return (
    <div
      className="grid gap-1.5 sm:gap-2"
      style={{ gridTemplateColumns: 'auto repeat(11, minmax(0, 1fr))' }}
    >
      <div aria-hidden />
      {PLAN_COLS.map((col) => (
        <div
          key={`h-${col}`}
          className="text-md-text-muted text-center text-[10px] font-bold tracking-wide uppercase"
        >
          {col}
        </div>
      ))}

      {PLAN_ROWS.map((row) => (
        <Fragment key={row}>
          <div className="text-md-blue-dark flex items-center justify-center text-lg font-extrabold">
            {row}
          </div>
          {PLAN_COLS.map((col) => {
            const num = `${row}${col}`;
            const stand = byNumber.get(num);
            if (!stand) {
              return (
                <div
                  key={num}
                  aria-hidden
                  className="aspect-square rounded bg-slate-50/60"
                  title={`${num} — pas de stand (allée / scène)`}
                />
              );
            }
            return (
              <StandCellReadOnly
                key={num}
                stand={stand}
                isHighlighted={stand.id === highlightedStandId}
                t={t}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function StandCellReadOnly({
  stand,
  isHighlighted,
  t,
}: {
  stand: StandPublicView;
  isHighlighted: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const statusLabel = t(`stand_status_${stand.status}` as const);
  const borderClass = {
    libre: 'border-emerald-500 bg-emerald-50',
    reserve: 'border-orange-500 bg-orange-50',
    paye: 'border-red-500 bg-red-50',
    bloque: 'border-slate-400 bg-slate-100',
  }[stand.status];

  // RGPD opt-out : on n'affiche le nom company que si visibility=true.
  const hiddenLabel = t('stand_company_hidden');
  const displayName =
    stand.prospect && stand.status !== 'bloque'
      ? stand.prospect.company_public_visibility
        ? stand.prospect.company_name
        : hiddenLabel
      : null;
  const isHidden = displayName === hiddenLabel;

  const tooltipParts = [`Stand ${stand.number}`];
  if (displayName) tooltipParts.push(displayName);
  tooltipParts.push(statusLabel);
  tooltipParts.push(`${stand.taille_m2} m²`);

  return (
    <div
      data-stand-number={stand.number}
      data-stand-status={stand.status}
      data-highlighted={isHighlighted ? 'true' : undefined}
      className={cn(
        'relative flex aspect-square flex-col items-start gap-0.5 rounded border-2 p-1.5 text-left',
        borderClass,
        isHighlighted && 'ring-2 ring-pink-500 ring-offset-1',
      )}
      title={tooltipParts.join(' · ')}
    >
      <span className="text-md-blue-dark text-xs leading-none font-extrabold">{stand.number}</span>
      <span className="text-md-text-muted text-[9px] leading-none">{stand.taille_m2}m²</span>
      {displayName ? (
        <span
          className={cn(
            'mt-0.5 line-clamp-1 text-[9px] leading-tight font-semibold',
            isHidden ? 'text-md-text-muted italic' : 'text-md-text',
          )}
        >
          {displayName}
        </span>
      ) : null}
    </div>
  );
}
