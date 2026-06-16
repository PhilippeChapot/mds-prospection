import { notFound } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getVisitorByIdAction } from '@/lib/admin/visitors/list-actions';
import { existsAsSpeaker } from '@/lib/admin/conversions/exists-helpers';
import { getInvitationPdfSignedUrl } from '@/lib/storage/visitor-invitations';
import {
  VisitorDetailClient,
  type VisitorDetail,
  type VisitorTimelineEntry,
} from './VisitorDetailClient';

export const metadata = { title: 'Fiche visiteur' };

type Params = Promise<{ id: string }>;

export default async function VisitorDetailPage({ params }: { params: Params }) {
  const profile = await requireAdminProfile();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const visitor = (await getVisitorByIdAction(id)) as VisitorDetail | null;
  if (!visitor) notFound();

  const supabase = getSupabaseServiceClient();

  const [{ data: auditRows }, { data: owners }] = await Promise.all([
    supabase
      .from('audit_log')
      .select('id, action, before, after, created_at, actor:users(full_name, email)')
      .eq('entity_type', 'visitors')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'sales', 'super_admin'])
      .order('full_name', { ascending: true }),
  ]);

  const timeline: VisitorTimelineEntry[] = (auditRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
    const after = (row.after ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      action: row.action as string,
      kind: (after.kind as string | undefined) ?? null,
      created_at: row.created_at as string,
      actor_name:
        (actor as { full_name?: string | null; email?: string } | null)?.full_name?.trim() ||
        (actor as { email?: string } | null)?.email ||
        'Système',
    };
  });

  const ownersOptions = (owners ?? []).map((o) => ({
    id: o.id,
    label: `${o.full_name?.trim() || o.email} · ${o.role}`,
  }));

  const contactId = (visitor.contact as { id?: string } | null)?.id;
  const alreadySpeaker = contactId ? await existsAsSpeaker(contactId) : false;

  // P15.4 — signed URL du PDF lettre d'invitation (si généré).
  const invData = (visitor as { invitation_data?: { pdf_storage_path?: string | null } | null })
    .invitation_data;
  let invitationPdfUrl: string | null = null;
  if (invData?.pdf_storage_path) {
    try {
      invitationPdfUrl = await getInvitationPdfSignedUrl(invData.pdf_storage_path, 3600);
    } catch {
      invitationPdfUrl = null;
    }
  }

  return (
    <VisitorDetailClient
      visitor={visitor}
      timeline={timeline}
      owners={ownersOptions}
      currentRole={profile.role}
      alreadySpeaker={alreadySpeaker}
      invitationPdfUrl={invitationPdfUrl}
    />
  );
}
