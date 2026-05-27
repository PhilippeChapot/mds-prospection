import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { previewAudienceAction } from '@/lib/admin/campaigns/actions';
import type { CampaignCategory } from '@/lib/admin/campaigns/types';
import { CampaignDetailClient } from './CampaignDetailClient';

export const metadata = { title: 'Campagne' };
export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAdminProfile();
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select(
      `id, name, category, audience_key, audience_filters, content_mode,
       subject_fr, body_fr, brevo_template_id, status, scheduled_at,
       recipient_count, sent_count, error_count, test_email_sent_at,
       created_at, sent_at, created_by_user_id, sent_by_user_id`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!campaign) notFound();

  let previewCount = campaign.recipient_count ?? 0;
  if (
    campaign.audience_key &&
    campaign.category &&
    (campaign.status === 'draft' || campaign.status === 'scheduled')
  ) {
    try {
      const preview = await previewAudienceAction({
        audience_key: campaign.audience_key,
        category: campaign.category as CampaignCategory,
        filters: (campaign.audience_filters ?? {}) as {
          poles?: string[];
          etapes?: string[];
          langue?: 'FR' | 'EN';
        },
      });
      previewCount = preview.total_eligible;
    } catch {
      // fallback to stored recipient_count.
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/campaigns"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour aux campagnes
      </Link>
      <CampaignDetailClient
        campaign={{
          id: campaign.id,
          name: campaign.name,
          category: campaign.category,
          audience_key: campaign.audience_key,
          status: campaign.status,
          subject: campaign.subject_fr,
          body_html: campaign.body_fr,
          content_mode: campaign.content_mode,
          brevo_template_id: campaign.brevo_template_id,
          test_email_sent_at: campaign.test_email_sent_at,
          recipient_count: campaign.recipient_count ?? 0,
          sent_count: campaign.sent_count ?? 0,
          error_count: campaign.error_count ?? 0,
          scheduled_at: campaign.scheduled_at,
          sent_at: campaign.sent_at,
        }}
        previewCount={previewCount}
        canSend={profile.role === 'admin' || profile.role === 'super_admin'}
      />
    </div>
  );
}
