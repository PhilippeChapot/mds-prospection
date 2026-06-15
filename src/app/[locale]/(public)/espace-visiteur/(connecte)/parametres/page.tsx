import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { User, Mail } from 'lucide-react';
import { loadVisitorData } from '@/lib/espace-visiteur/session';
import { VisitorSecuritySection } from '../_components/VisitorSecuritySection';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === 'en' ? 'Settings · Visitor portal' : 'Paramètres · Espace Visiteur' };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function VisitorSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'espaceVisiteur.parametres' });

  const data = await loadVisitorData(safeLocale);
  const fullName = [data.contact?.first_name, data.contact?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-md-text text-2xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-md-text-muted mt-1 text-sm">{t('subtitle')}</p>
      </header>

      {/* 1. Profil */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <User className="text-md-blue size-4 shrink-0" aria-hidden />
          <h2 className="text-md-text font-semibold">{t('profil.title')}</h2>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
              {t('profil.name')}
            </dt>
            <dd className="text-md-text">{fullName || '—'}</dd>
          </div>
          <div>
            <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
              {t('profil.phone')}
            </dt>
            <dd className="text-md-text">{data.contact?.phone_mobile || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
              {t('profil.email')}
            </dt>
            <dd className="text-md-text font-mono">{data.contact?.email ?? '—'}</dd>
          </div>
        </dl>
        <p className="text-md-text-muted text-xs">{t('profil.editHint')}</p>
      </section>

      {/* 2. Préférences email */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Mail className="text-md-blue size-4 shrink-0" aria-hidden />
          <h2 className="text-md-text font-semibold">{t('preferences.title')}</h2>
        </div>
        <p className="text-md-text-muted text-sm">{t('preferences.body')}</p>
      </section>

      {/* 3. Sécurité */}
      <VisitorSecuritySection
        locale={safeLocale}
        passwordSetAt={data.account?.password_set_at ?? null}
      />
    </div>
  );
}
