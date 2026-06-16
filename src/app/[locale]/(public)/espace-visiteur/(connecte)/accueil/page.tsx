import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { FileText, Download } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { loadVisitorData } from '@/lib/espace-visiteur/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getInvitationPdfSignedUrl } from '@/lib/storage/visitor-invitations';
import { VisitorChatSection } from '../_components/VisitorChatSection';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === 'en' ? 'Home · Visitor portal' : 'Accueil · Espace Visiteur' };
}

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function VisitorHomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: 'fr' | 'en' = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'espaceVisiteur.home' });

  const data = await loadVisitorData(safeLocale);
  const firstName = data.contact?.first_name?.trim() || '';

  // P15.4 — état de la demande de lettre d'invitation.
  const supabase = getSupabaseServiceClient();
  const { data: invitation } = await supabase
    .from('visitor_invitation_data')
    .select('approval_status, rejection_reason, pdf_storage_path')
    .eq('visitor_id', data.visitor.id)
    .maybeSingle();

  const invStatus = invitation?.approval_status ?? null;
  const invReady =
    (invStatus === 'auto_approved' || invStatus === 'approved') && !!invitation?.pdf_storage_path;
  let invPdfUrl: string | null = null;
  if (invReady && invitation?.pdf_storage_path) {
    try {
      invPdfUrl = await getInvitationPdfSignedUrl(invitation.pdf_storage_path, 3600);
    } catch {
      invPdfUrl = null;
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. Bienvenue */}
      <section className="border-md-border bg-card space-y-2 rounded-xl border p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-md-text text-2xl font-extrabold tracking-tight">
            {firstName ? t('welcomeNamed', { name: firstName }) : t('welcome')}
          </h1>
          {data.visitor.is_vip && (
            <span className="bg-md-magenta/10 text-md-magenta rounded-full px-2.5 py-0.5 text-xs font-bold">
              🌟 VIP
            </span>
          )}
        </div>
        <p className="text-md-text-muted text-sm">{t('intro')}</p>
      </section>

      {/* 2. Lettre d'invitation / visa (P15.4) */}
      <section className="border-md-border bg-card space-y-3 rounded-xl border p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <FileText className="text-md-blue size-4 shrink-0" aria-hidden />
          <h2 className="text-md-text font-semibold">{t('visa.title')}</h2>
        </div>

        {!invStatus ? (
          <>
            <p className="text-md-text-muted text-sm">{t('visa.body')}</p>
            <Link
              href="/espace-visiteur/invitation"
              className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
            >
              <FileText className="size-4" aria-hidden />
              {t('visa.request')}
            </Link>
          </>
        ) : invReady ? (
          <>
            <p className="text-md-text text-sm">✅ {t('visa.ready')}</p>
            {invPdfUrl ? (
              <a
                href={invPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-md-blue hover:bg-md-blue-dark inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white"
              >
                <Download className="size-4" aria-hidden />
                {t('visa.download')}
              </a>
            ) : null}
          </>
        ) : invStatus === 'pending' ? (
          <p className="text-md-text-muted text-sm">⏳ {t('visa.pending')}</p>
        ) : invStatus === 'rejected' ? (
          <div className="space-y-1">
            <p className="text-md-text text-sm">❌ {t('visa.rejected')}</p>
            {invitation?.rejection_reason ? (
              <p className="text-md-text-muted text-xs">
                {t('visa.rejectedReason')} {invitation.rejection_reason}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 3. Chat (widget P9.1-natif réutilisé) */}
      <VisitorChatSection
        locale={safeLocale}
        prefill={{
          firstName: data.contact?.first_name ?? '',
          lastName: data.contact?.last_name ?? '',
          email: data.contact?.email ?? '',
          company: data.company?.name ?? '',
          phone: data.contact?.phone_mobile ?? '',
        }}
      />
    </div>
  );
}
