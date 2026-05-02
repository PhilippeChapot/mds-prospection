import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { Locale } from 'next-intl';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations('home');

  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden px-6 py-20 text-white sm:py-28"
        style={{
          background:
            'linear-gradient(135deg, rgba(3,26,86,0.94) 0%, rgba(41,66,148,0.94) 100%), radial-gradient(circle at 20% 80%, rgba(230,0,126,0.4), transparent 50%)',
          backgroundColor: 'var(--color-md-blue-dark)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
          <div className="space-y-4">
            <p className="text-md-magenta-soft text-sm font-semibold tracking-widest uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
              {t('tagline')}
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-pretty text-white/85 md:text-xl">
              {t('subtitle')}
            </p>
          </div>

          {/* Dates events */}
          <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <EventCard
              title={t('event1.title')}
              date={t('event1.date')}
              location={t('event1.location')}
            />
            <EventCard
              title={t('event2.title')}
              date={t('event2.date')}
              location={t('event2.location')}
            />
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Button asChild size="lg" className="bg-md-magenta hover:bg-md-magenta-soft">
              <Link href={{ pathname: '/inscription-exposant', query: { category: 'exposant' } }}>
                {t('ctaExhibitor')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={{ pathname: '/inscription-exposant', query: { category: 'partenaire' } }}>
                {t('ctaPartner')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Reassurance */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-md-text mb-3 text-2xl font-bold md:text-3xl">{t('reassureTitle')}</h2>
        <p className="text-md-text-muted mx-auto max-w-2xl text-base md:text-lg">
          {t('reassureBody')}
        </p>
      </section>
    </>
  );
}

function EventCard({ title, date, location }: { title: string; date: string; location: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5 text-left backdrop-blur">
      <p className="text-md-magenta-soft mb-2 text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      <div className="flex items-center gap-2 text-sm text-white">
        <Calendar className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span>{date}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-white/80">
        <MapPin className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span>{location}</span>
      </div>
    </div>
  );
}
