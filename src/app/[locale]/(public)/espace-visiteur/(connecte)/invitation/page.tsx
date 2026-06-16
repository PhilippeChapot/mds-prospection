import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { loadVisitorData } from '@/lib/espace-visiteur/session';
import { VisitorInvitationForm } from './VisitorInvitationForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      locale === 'en'
        ? 'Invitation letter · Visitor portal'
        : "Lettre d'invitation · Espace Visiteur",
  };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function VisitorInvitationPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'espaceVisiteur.invitation' });

  const data = await loadVisitorData(safeLocale);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-text text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      <VisitorInvitationForm
        locale={safeLocale}
        defaults={{
          company_name: data.company?.name ?? '',
          city: '',
          country: '',
        }}
      />
    </div>
  );
}
