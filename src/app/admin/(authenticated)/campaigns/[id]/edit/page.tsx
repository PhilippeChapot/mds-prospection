import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { AUDIENCES } from '@/lib/admin/campaigns/audiences';
import { CAMPAIGN_CATEGORIES, type CampaignCategory } from '@/lib/admin/campaigns/types';
import { NewCampaignWizard, type CampaignInitial } from '../../new/NewCampaignWizard';

export const metadata = { title: 'Éditer la campagne' };
export const dynamic = 'force-dynamic';

/**
 * P8.3-bis Fix #1 — page d'edition d'un brouillon.
 *
 * Reutilise le wizard 3-step pre-rempli. Cote action, le draft est
 * editable uniquement si status='draft' ou 'scheduled' ; sent/sending/
 * error sont rejetes (editCampaignAction).
 */
export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAdminProfile();
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select(
      `id, name, status, category, audience_key, audience_filters, content_mode,
       subject_fr, body_fr, subject_en, body_en,
       fr_translated_by_ai_at, en_translated_by_ai_at,
       brevo_template_id, scheduled_at`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!campaign) notFound();

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href={`/admin/campaigns/${id}`}
          className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour à la campagne
        </Link>
        <div className="border-md-warning/40 bg-md-warning/10 rounded-md border p-4 text-sm">
          Cette campagne ne peut plus être éditée (statut <strong>{campaign.status}</strong>).
        </div>
      </div>
    );
  }

  const initial: CampaignInitial = {
    campaign_id: campaign.id,
    name: campaign.name,
    audience_key: campaign.audience_key ?? 'newsletter_subscribers',
    category: ((campaign.category as CampaignCategory) ?? 'general') as CampaignCategory,
    audience_filters: (campaign.audience_filters ?? null) as CampaignInitial['audience_filters'],
    content_mode: ((campaign.content_mode as 'inline' | 'template') ?? 'inline') as
      | 'inline'
      | 'template',
    subject: campaign.subject_fr ?? '',
    body_html: campaign.body_fr,
    subject_en: campaign.subject_en,
    body_html_en: campaign.body_en,
    fr_translated_by_ai_at: campaign.fr_translated_by_ai_at,
    en_translated_by_ai_at: campaign.en_translated_by_ai_at,
    brevo_template_id: campaign.brevo_template_id,
    scheduled_at: campaign.scheduled_at,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/admin/campaigns/${id}`}
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour à la campagne
      </Link>
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          ✏️ Éditer la campagne
        </h1>
        <p className="text-md-text-muted text-sm">
          Toute modification réinitialise l&apos;email test (vous devrez en renvoyer un avant
          l&apos;envoi de masse).
        </p>
      </header>

      <NewCampaignWizard
        audiences={AUDIENCES}
        categories={[...CAMPAIGN_CATEGORIES]}
        canSend={profile.role === 'admin' || profile.role === 'super_admin'}
        initial={initial}
      />
    </div>
  );
}
