/**
 * P6.x.4-a-octies — section "Les etapes de l'edition 2026" sur la landing.
 *
 * Affiche les 3 villes (Marseille, Paris, Bruxelles) en grid responsive.
 *
 * - Marseille & Paris : CTA interne vers /inscription-partenaire?venue=... (wizard).
 * - Bruxelles : lecture seule (pas de back office). CTA = mailto contact MDS.
 *
 * P6.x.4-a-nonies : la carte n'est plus enveloppee dans un anchor — seul le
 * bouton est cliquable. Evite l'anchor imbrique (carte<a> + bouton<a>) qui
 * cassait le click sur certains navigateurs (notamment Safari mobile sur le
 * mailto Bruxelles).
 *
 * Sync Server Component : utilise `useTranslations` (next-intl set via
 * setRequestLocale dans la page parente).
 */

import { useTranslations } from 'next-intl';
import { ArrowRight, Calendar, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BruxellesCtaButton } from './BruxellesCtaButton';

interface Etape {
  id: 'marseille' | 'paris' | 'bruxelles';
  flag: string;
  image: string;
  /** Param venue interne ; null pour Bruxelles (CTA = ouverture du form contact). */
  venueParam: 'marseille' | 'paris' | null;
  cardClass: string;
  buttonClass: string;
}

export const ETAPES: readonly Etape[] = [
  {
    id: 'marseille',
    flag: '🇫🇷',
    image: '/landing/etape-marseille.png',
    venueParam: 'marseille',
    cardClass: 'bg-blue-50',
    buttonClass: 'bg-md-magenta hover:bg-md-magenta-soft text-white',
  },
  {
    id: 'paris',
    flag: '🇫🇷',
    image: '/landing/etape-paris.png',
    venueParam: 'paris',
    cardClass: 'bg-pink-50',
    buttonClass: 'bg-md-magenta hover:bg-md-magenta-soft text-white',
  },
  {
    id: 'bruxelles',
    flag: '🇧🇪',
    image: '/landing/etape-bruxelles.png',
    venueParam: null,
    cardClass: 'bg-amber-50',
    buttonClass: 'bg-md-blue-dark hover:bg-md-blue-deep text-white',
  },
] as const;

export function EtapesSection() {
  const t = useTranslations('landing.etapes');

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-10 text-center">
        <h2 className="text-md-blue-dark text-3xl font-extrabold tracking-tight md:text-4xl">
          {t('sectionTitle')}
        </h2>
        <p className="text-md-text-muted mx-auto mt-3 max-w-2xl text-base">
          {t('sectionSubtitle')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {ETAPES.map((etape) => (
          <EtapeCard key={etape.id} etape={etape} />
        ))}
      </div>
    </section>
  );
}

function EtapeCard({ etape }: { etape: Etape }) {
  const t = useTranslations(`landing.etapes.${etape.id}`);
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl shadow-md transition hover:shadow-xl',
        etape.cardClass,
      )}
    >
      <div className="relative h-48 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={etape.image} alt={t('title')} className="h-full w-full object-cover" />
        <div className="absolute top-2 right-3 text-3xl drop-shadow-md" aria-hidden>
          {etape.flag}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6 text-center">
        <h3 className="text-md-magenta mb-2 text-base font-extrabold tracking-wide">
          {t('title')}
        </h3>
        <div className="text-md-blue-dark mb-1 flex items-center justify-center gap-1.5 text-lg font-extrabold md:text-xl">
          <Calendar className="size-4 opacity-70" aria-hidden />
          <span>{t('date')}</span>
        </div>
        <div className="text-md-text-muted mb-5 flex items-center justify-center gap-1.5 text-sm">
          <MapPin className="size-3.5 opacity-70" aria-hidden />
          <span>{t('venue')}</span>
        </div>
        <div className="mt-auto">
          <EtapeCta etape={etape} label={t('cta')} ariaLabel={`${t('title')} — ${t('cta')}`} />
        </div>
      </div>
    </article>
  );
}

function EtapeCta({ etape, label, ariaLabel }: { etape: Etape; label: string; ariaLabel: string }) {
  const className = cn('w-full', etape.buttonClass);
  if (etape.venueParam) {
    return (
      <Button asChild className={className}>
        <Link
          href={{ pathname: '/inscription-partenaire', query: { venue: etape.venueParam } }}
          aria-label={ariaLabel}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            {label}
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>
      </Button>
    );
  }
  // P6.x.4-a-decies : Bruxelles ouvre le form contact (plus de mailto)
  return <BruxellesCtaButton label={label} ariaLabel={ariaLabel} className={etape.buttonClass} />;
}
