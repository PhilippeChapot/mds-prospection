'use client';

/**
 * P6.x.4-a — grid 6 cartes pôles + drawer Sheet sur clic.
 *
 * P6.x.4-a-ter — wiring next-intl : noms/descriptions/CTA labels lus depuis
 * messages/{fr,en}.json (clés sous landing.poles.* et landing.cta.*).
 * Les sous-secteurs (libellés) sont localisés via getSubSectorLabel.
 *
 * Doctrine messaging (cf. brief) :
 *   - Pôle "mediadays_classique" (RÉGIES & RETAIL MEDIA) → CTA externe
 *     vers mediadays.net + sous-CTA "Visiteur gratuit".
 *   - Pôles "mediadays_solutions" → CTA interne "Réserver mon stand"
 *     vers /inscription-exposant.
 */

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { Pole } from '@/lib/landing/taxonomy';
import { getSubSectorLabel } from '@/lib/landing/subsector-translations';

const EXHIBITOR_SIGNUP_URL = '/inscription-exposant?category=exposant';
const VISITOR_SIGNUP_URL = '/inscription-exposant?category=visiteur';
const MEDIADAYS_NET_URL = 'https://mediadays.net';

function hexWithAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export function PolesExplorer({ poles }: { poles: Pole[] }) {
  const [selected, setSelected] = useState<Pole | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {poles.map((pole) => (
          <PoleCard key={pole.code} pole={pole} onClick={() => setSelected(pole)} />
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? <PoleDetail pole={selected} /> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PoleCard({ pole, onClick }: { pole: Pole; onClick: () => void }) {
  const t = useTranslations('landing');
  const tp = useTranslations(`landing.poles.${pole.code}`);
  const name = tp('name');
  const description = tp('description');
  const subLabel = tp('subLabel');

  return (
    <button
      type="button"
      onClick={onClick}
      className="group focus:ring-md-magenta/40 relative flex flex-col rounded-2xl border border-black/5 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2"
      style={{ background: hexWithAlpha(pole.color, 0.35) }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-2xl leading-none">{pole.emoji}</div>
          <h3 className="text-md-blue-dark text-base font-extrabold tracking-tight">{name}</h3>
          {subLabel ? (
            <p className="text-md-blue-deep mt-0.5 text-xs font-semibold">{subLabel}</p>
          ) : null}
        </div>
        <span className="text-md-blue-dark inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
          {pole.category === 'mediadays_classique' ? t('card.mediadays') : t('card.mdSolutions')}
        </span>
      </div>
      <p className="text-md-text/85 mb-4 line-clamp-3 text-sm">{description}</p>
      <div className="mt-auto flex items-center justify-between text-xs font-semibold">
        <span className="text-md-text">
          {t('card.subSectorsStats', {
            count: pole.total_sous_secteurs,
            exhibitors: pole.total_exposants_cibles,
          })}
        </span>
        <span className="text-md-magenta flex items-center gap-1 transition-all group-hover:gap-2">
          {t('card.explore')} <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </div>
    </button>
  );
}

function PoleDetail({ pole }: { pole: Pole }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const locale = useLocale();
  const t = useTranslations('landing');
  const tp = useTranslations(`landing.poles.${pole.code}`);
  const name = tp('name');
  const description = tp('description');
  const subLabel = tp('subLabel');

  return (
    <div className="flex h-full flex-col">
      <div
        className="border-b border-black/5 px-2 py-4"
        style={{ background: hexWithAlpha(pole.color, 0.35) }}
      >
        <div className="text-3xl">{pole.emoji}</div>
        <SheetTitle className="text-md-blue-dark mt-1 text-xl font-extrabold">{name}</SheetTitle>
        {subLabel ? <p className="text-md-blue-deep text-sm font-semibold">{subLabel}</p> : null}
        <SheetDescription className="text-md-text mt-2 text-sm">{description}</SheetDescription>
        {pole.zone ? (
          <p className="text-md-text-muted mt-2 text-xs">
            <span className="font-semibold">{t('drawer.hostingRoom')} :</span> {pole.zone}
          </p>
        ) : null}
        <p className="text-md-text-muted mt-1 text-xs">
          <span className="font-semibold">{t('drawer.stats')} :</span>{' '}
          {t('card.subSectorsStats', {
            count: pole.total_sous_secteurs,
            exhibitors: pole.total_exposants_cibles,
          })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <h4 className="text-md-blue-dark mb-3 text-sm font-bold tracking-wide uppercase">
          {t('drawer.subSectorsTitle')}
        </h4>
        <ul className="space-y-2">
          {pole.sous_secteurs.map((ss, idx) => (
            <li
              key={ss.name}
              className="border-md-border overflow-hidden rounded-lg border bg-white"
            >
              <button
                type="button"
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                aria-expanded={expandedIdx === idx}
              >
                <span className="text-md-text font-semibold">
                  {getSubSectorLabel(ss.name, locale)}{' '}
                  <span className="text-md-text-muted font-normal">({ss.count})</span>
                </span>
                {expandedIdx === idx ? (
                  <ChevronUp className="size-4" aria-hidden />
                ) : (
                  <ChevronDown className="size-4" aria-hidden />
                )}
              </button>
              {expandedIdx === idx ? (
                <div className="text-md-text-muted bg-muted/30 border-md-border border-t px-3 py-2 text-xs">
                  {ss.exemples.join(' · ')}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <PoleCta pole={pole} />
    </div>
  );
}

function PoleCta({ pole }: { pole: Pole }) {
  const t = useTranslations('landing.cta');
  if (pole.category === 'mediadays_classique') {
    return (
      <div className="border-md-border space-y-2 border-t bg-white p-4">
        <Button asChild className="bg-md-magenta hover:bg-md-magenta/90 w-full">
          <a href={MEDIADAYS_NET_URL} target="_blank" rel="noopener noreferrer">
            {t('exhibitMediadaysNet')}
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href={VISITOR_SIGNUP_URL}>{t('registerVisitorFree')}</a>
        </Button>
      </div>
    );
  }
  return (
    <div className="border-md-border border-t bg-white p-4">
      <Button asChild className="bg-md-magenta hover:bg-md-magenta/90 w-full">
        <a href={EXHIBITOR_SIGNUP_URL}>
          {t('bookMyBooth')}
          <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
        </a>
      </Button>
    </div>
  );
}
