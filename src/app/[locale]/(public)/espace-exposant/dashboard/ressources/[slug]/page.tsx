import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MarkdownView } from '@/components/exhibitor-resources/MarkdownView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return { title: `${slug} — Ressources Espace Exposant` };
}

function formatRelative(iso: string, locale: 'fr' | 'en'): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return locale === 'fr' ? "aujourd'hui" : 'today';
  if (days < 30) return locale === 'fr' ? `il y a ${days}j` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return locale === 'fr' ? `il y a ${months} mois` : `${months}mo ago`;
}

export default async function RessourceDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'ExhibitorResources' });
  const localeShort = (locale === 'fr' ? 'fr' : 'en') as 'fr' | 'en';

  const supabase = await createSupabaseServerClient();
  const { data: resource } = await supabase
    .from('exhibitor_resources')
    .select('id, slug, title_fr, title_en, body_fr, body_en, is_published, updated_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!resource) {
    notFound();
  }

  const title = localeShort === 'fr' ? resource.title_fr : resource.title_en;
  const body = (localeShort === 'fr' ? resource.body_fr : resource.body_en) ?? '';

  return (
    <Card className="border-md-border space-y-4 p-5 shadow-sm sm:p-6">
      <nav className="text-md-text-muted text-xs">
        <Link
          href={`/${locale}/espace-exposant/dashboard/ressources`}
          className="hover:text-md-blue inline-flex items-center gap-1 hover:underline"
        >
          <ArrowLeft className="size-3" aria-hidden />
          {t('back_to_list')}
        </Link>
      </nav>

      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          {title}
        </h1>
        <p className="text-md-text-muted text-xs">
          {t('updated_at', { date: formatRelative(resource.updated_at, localeShort) })}
        </p>
      </header>

      <article className="border-md-border rounded-md border bg-white p-5">
        <MarkdownView body={body} />
      </article>
    </Card>
  );
}
