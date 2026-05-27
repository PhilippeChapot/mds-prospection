import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { AUDIENCES } from '@/lib/admin/campaigns/audiences';
import { CAMPAIGN_CATEGORIES } from '@/lib/admin/campaigns/types';
import { NewCampaignWizard } from './NewCampaignWizard';

export const metadata = { title: 'Nouvelle campagne' };
export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const profile = await requireAdminProfile();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/admin/campaigns"
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Retour aux campagnes
      </Link>
      <header>
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          ✉️ Nouvelle campagne
        </h1>
        <p className="text-md-text-muted text-sm">
          Sélectionnez une audience, rédigez votre contenu, prévisualisez, envoyez.
        </p>
      </header>

      <NewCampaignWizard
        audiences={AUDIENCES}
        categories={[...CAMPAIGN_CATEGORIES]}
        canSend={profile.role === 'admin' || profile.role === 'super_admin'}
      />
    </div>
  );
}
