import { notFound } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { getConferenceByIdAction } from '@/lib/admin/conferences/crud-actions';
import {
  ConferenceDetailClient,
  type ConferenceDetail,
  type AttachedSpeaker,
  type TimelineEntry,
} from './ConferenceDetailClient';

export const metadata = { title: 'Fiche conférence' };

type Params = Promise<{ id: string }>;

export default async function ConferenceDetailPage({ params }: { params: Params }) {
  const profile = await requireAdminProfile();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const conf = (await getConferenceByIdAction(id)) as Record<string, unknown> | null;
  if (!conf) notFound();

  const supabase = getSupabaseServiceClient();
  const { data: auditRows } = await supabase
    .from('audit_log')
    .select('id, action, after, created_at, actor:users(full_name, email)')
    .eq('entity_type', 'conferences')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

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

  // Aplatit les speakers rattachés, triés par speaking_order.
  const csRaw = (conf.conference_speakers ?? []) as Array<Record<string, unknown>>;
  const speakers: AttachedSpeaker[] = csRaw
    .map((cs) => {
      const sp = cs.speaker as Record<string, unknown> | null;
      const contact = sp
        ? Array.isArray(sp.contact)
          ? (sp.contact[0] as Record<string, unknown>)
          : (sp.contact as Record<string, unknown> | null)
        : null;
      const name =
        [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() ||
        (contact?.email as string | undefined) ||
        '—';
      return {
        speaker_id: (sp?.id as string) ?? '',
        name,
        photo_url: (sp?.photo_url as string | null) ?? null,
        role: (cs.role as string | null) ?? null,
        speaking_order: (cs.speaking_order as number | null) ?? 0,
      };
    })
    .filter((s) => s.speaker_id)
    .sort((a, b) => (a.speaking_order ?? 0) - (b.speaking_order ?? 0));

  const detail: ConferenceDetail = {
    id: conf.id as string,
    title_fr: conf.title_fr as string,
    title_en: (conf.title_en as string | null) ?? null,
    description_fr: (conf.description_fr as string | null) ?? null,
    description_en: (conf.description_en as string | null) ?? null,
    target_audience_fr: (conf.target_audience_fr as string | null) ?? null,
    target_audience_en: (conf.target_audience_en as string | null) ?? null,
    conference_type: (conf.conference_type as string | null) ?? null,
    start_at: (conf.start_at as string | null) ?? null,
    end_at: (conf.end_at as string | null) ?? null,
    room: (conf.room as string | null) ?? null,
    city: (conf.city as string | null) ?? null,
    capacity: (conf.capacity as number | null) ?? null,
    poles: (conf.poles as string[] | null) ?? null,
    is_published: Boolean(conf.is_published),
    featured: Boolean(conf.featured),
    slug: (conf.slug as string | null) ?? null,
    is_validated: Boolean(conf.is_validated),
    imported_at: (conf.imported_at as string | null) ?? null,
  };

  return (
    <ConferenceDetailClient
      conference={detail}
      speakers={speakers}
      timeline={timeline}
      currentRole={profile.role}
    />
  );
}
