import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { getPublishedResourcesAction } from '@/lib/exhibitor-resources/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ressources — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

function formatRelativeFr(iso: string, locale: 'fr' | 'en'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return locale === 'fr' ? "aujourd'hui" : 'today';
  if (days < 30) return locale === 'fr' ? `il y a ${days}j` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return locale === 'fr' ? `il y a ${months} mois` : `${months}mo ago`;
}

function extractExcerpt(markdown: string, maxLen = 150): string {
  // Strip markdown syntax (headers, links, bold, etc.) pour l'aperçu
  const stripped = markdown
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen).trimEnd() + '…';
}

export default async function RessourcesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'ExhibitorResources' });

  const localeShort = (locale === 'fr' ? 'fr' : 'en') as 'fr' | 'en';
  const result = await getPublishedResourcesAction(localeShort);
  const resources = result.ok ? result.data : [];

  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-md-text text-base font-semibold">📚 {t('page_title')}</h2>
        <p className="text-md-text-muted mt-1 text-sm">{t('page_subtitle')}</p>
      </div>

      {resources.length === 0 ? (
        <div className="text-md-text-muted border-md-border rounded-md border border-dashed p-6 text-center text-sm">
          {t('empty_state')}
        </div>
      ) : (
        <ul className="space-y-2">
          {resources.map((r) => (
            <li key={r.id}>
              <Link
                href={`/${locale}/espace-exposant/dashboard/ressources/${r.slug}`}
                className="border-md-border hover:border-md-blue/40 hover:bg-md-bg-soft/40 block rounded-lg border p-4 transition"
              >
                <h3 className="text-md-blue-dark font-semibold">{r.title}</h3>
                <p className="text-md-text mt-1 text-sm">{extractExcerpt(r.body)}</p>
                <p className="text-md-text-muted mt-2 text-[11px]">
                  {t('updated_at', { date: formatRelativeFr(r.updated_at, localeShort) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
