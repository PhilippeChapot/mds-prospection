/**
 * P7.x.AffiliePitchsAndChat — page "Mes pitchs" affilie.
 *
 * Server component : requireAffilieSession + hydrate les 3 signed URLs
 * DOCX + rend le contenu structure (FR ou EN selon locale). Le contenu
 * est dans src/content/affilie-pitchs/content.ts.
 */

import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { Download, FileText } from 'lucide-react';
import { requireAffilieSession } from '@/lib/affilie/session';
import { getAffiliePitchsDownloadsAction } from '@/lib/affilie/pitchs-actions';
import { getAffilieContent } from '@/content/affilie-pitchs/content';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === 'en' ? 'Pitches · Affiliate MDS 2026' : 'Pitchs · Affilié MDS 2026' };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AffiliePitchsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAffilieSession(locale);

  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'AffiliePitchs' });
  const content = getAffilieContent(safeLocale);
  const downloads = await getAffiliePitchsDownloadsAction(safeLocale);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Hero */}
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          🎯 {content.hero.title}
        </h1>
        <p className="text-md-text-muted text-sm font-semibold">{content.hero.subtitle}</p>
        <p className="text-md-text mt-2 text-sm leading-relaxed">{content.hero.intro}</p>
        <p className="text-md-text-muted mt-1 text-xs italic">{content.hero.plural_note}</p>
      </header>

      {/* Downloads */}
      <Card className="space-y-3 p-5">
        <h2 className="text-md-blue-dark text-base font-bold">📥 {t('downloadsTitle')}</h2>
        <div className="flex flex-col gap-2">
          {downloads.map((d) => (
            <a
              key={d.key}
              href={d.signedUrl}
              download={d.filename}
              className="border-md-border hover:bg-muted/50 flex items-center gap-3 rounded-md border bg-white p-3 transition"
            >
              <FileText className="text-md-blue size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-md-text truncate text-sm font-semibold">{d.label}</div>
                <div className="text-md-text-muted truncate text-xs">{d.description}</div>
              </div>
              <Download className="text-md-text-muted size-4 shrink-0" aria-hidden />
            </a>
          ))}
        </div>
      </Card>

      {/* Pitch 20s */}
      <Section title={content.pitch20s.title}>
        <blockquote className="border-md-magenta bg-md-magenta/5 text-md-text border-l-4 p-4 text-sm leading-relaxed italic">
          {content.pitch20s.text}
        </blockquote>
      </Section>

      {/* Poles */}
      <Section title={content.poles.title}>
        <p className="text-md-text-muted mb-3 text-sm">{content.poles.intro}</p>
        <ul className="space-y-2">
          {content.poles.items.map((p) => (
            <li
              key={p.label}
              className="border-md-border bg-md-bg-soft flex gap-3 rounded-md border p-3"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {p.emoji}
              </span>
              <div>
                <div className="text-md-text text-sm font-bold">{p.label}</div>
                <p className="text-md-text-muted mt-0.5 text-xs leading-relaxed">{p.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Cities */}
      <Section title={content.cities.title}>
        <ul className="space-y-2">
          {content.cities.items.map((c) => (
            <li
              key={c.city}
              className={cn(
                'border-md-border flex flex-wrap items-baseline gap-2 rounded-md border bg-white p-3',
                c.tag && 'border-md-magenta/40 bg-md-magenta/5',
              )}
            >
              <span className="text-md-text text-sm font-bold">📍 {c.city}</span>
              <span className="text-md-text-muted text-xs">
                — {c.date} · {c.venue}
              </span>
              {c.tag ? (
                <span className="bg-md-magenta/15 text-md-magenta ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                  {c.tag}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-md-text-muted mt-3 text-xs italic">{content.cities.organizer_note}</p>
      </Section>

      {/* Paris Radio Show */}
      <Section title={content.paris_radio_show.title}>
        <p className="text-md-text text-sm leading-relaxed">{content.paris_radio_show.text}</p>
        <p className="border-md-blue bg-md-blue/5 text-md-text mt-3 border-l-4 p-3 text-sm leading-relaxed italic">
          {content.paris_radio_show.argument}
        </p>
      </Section>

      {/* 4 Arguments */}
      <Section title={content.arguments.title}>
        <ol className="space-y-3">
          {content.arguments.items.map((a, idx) => (
            <li key={a.heading} className="flex gap-3">
              <span className="bg-md-magenta inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                {idx + 1}
              </span>
              <div>
                <div className="text-md-text text-sm font-bold">{a.heading}</div>
                <p className="text-md-text-muted mt-0.5 text-sm leading-relaxed">{a.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Classic comparison */}
      <Section title={content.classic_comparison.title}>
        <p className="text-md-text mb-2 text-sm leading-relaxed">
          {content.classic_comparison.intro}
        </p>
        <p className="text-md-text-muted mb-3 text-sm leading-relaxed italic">
          {content.classic_comparison.what_is_classic}
        </p>
        <div className="overflow-x-auto">
          <table className="border-md-border w-full text-sm">
            <thead className="bg-md-bg-soft text-md-text">
              <tr>
                <th className="border-md-border border p-2 text-left text-xs" />
                <th className="border-md-border border p-2 text-left text-xs font-bold">
                  {content.classic_comparison.table.header_solutions}
                </th>
                <th className="border-md-border border p-2 text-left text-xs font-bold">
                  {content.classic_comparison.table.header_classic}
                </th>
              </tr>
            </thead>
            <tbody>
              {content.classic_comparison.table.rows.map((row) => (
                <tr key={row.label} className="bg-white">
                  <th
                    scope="row"
                    className="border-md-border text-md-text-muted border p-2 text-left text-xs font-bold tracking-wider uppercase"
                  >
                    {row.label}
                  </th>
                  <td className="border-md-border border p-2 text-xs">{row.solutions}</td>
                  <td className="border-md-border text-md-text-muted border p-2 text-xs">
                    {row.classic}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Golden Rule */}
      <Section title={content.golden_rule.title} variant="warning">
        <p className="text-md-text text-sm leading-relaxed">{content.golden_rule.text}</p>
        <p className="text-md-text mt-3 text-sm leading-relaxed font-semibold">
          {content.golden_rule.doubt}
        </p>
      </Section>

      {/* Objections */}
      <Section title={content.objections.title}>
        <div className="space-y-3">
          {content.objections.items.map((o, idx) => (
            <div key={idx} className="border-md-border rounded-md border bg-white p-3">
              <div className="text-md-text mb-1.5 text-sm font-bold">❓ {o.question}</div>
              <div className="text-md-text-muted text-sm leading-relaxed">→ {o.answer}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* How to conclude */}
      <Section title={content.how_to_conclude.title}>
        <ol className="space-y-2">
          {content.how_to_conclude.steps.map((step, idx) => (
            <li key={idx} className="flex gap-3 text-sm leading-relaxed">
              <span className="bg-md-blue inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                {idx + 1}
              </span>
              <span className="text-md-text">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Closing line */}
      <Card className="border-md-magenta/30 bg-md-magenta/5 space-y-2 p-5">
        <h3 className="text-md-magenta text-sm font-bold tracking-wider uppercase">
          {content.closing_line.title}
        </h3>
        <p className="text-md-text text-base leading-relaxed italic">{content.closing_line.text}</p>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
  variant,
}: {
  title: string;
  children: React.ReactNode;
  variant?: 'warning';
}) {
  return (
    <Card
      className={cn(
        'space-y-3 p-5',
        variant === 'warning' && 'border-md-warning/40 bg-md-warning/5',
      )}
    >
      <h2 className="text-md-blue-dark text-base font-bold">{title}</h2>
      <div>{children}</div>
    </Card>
  );
}
