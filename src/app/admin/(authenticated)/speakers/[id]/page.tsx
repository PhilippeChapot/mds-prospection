import { notFound } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getSpeakerByIdAction } from '@/lib/admin/speakers/list-actions';
import { SpeakerDetailClient, type SpeakerDetail, type TimelineEntry } from './SpeakerDetailClient';

export const metadata = { title: 'Fiche speaker' };

type Params = Promise<{ id: string }>;

export default async function SpeakerDetailPage({ params }: { params: Params }) {
  const profile = await requireAdminProfile();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const speaker = (await getSpeakerByIdAction(id)) as SpeakerDetail | null;
  if (!speaker) notFound();

  const supabase = getSupabaseServiceClient();
  const [{ data: auditRows }, { data: owners }] = await Promise.all([
    supabase
      .from('audit_log')
      .select('id, action, after, created_at, actor:users(full_name, email)')
      .eq('entity_type', 'speakers')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('role', ['admin', 'sales', 'super_admin'])
      .order('full_name', { ascending: true }),
  ]);

  const timeline: TimelineEntry[] = (auditRows ?? []).map((r) => {
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

  return (
    <SpeakerDetailClient
      speaker={speaker}
      timeline={timeline}
      owners={ownersOptions}
      currentRole={profile.role}
    />
  );
}
