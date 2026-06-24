'use server';

/**
 * P16.x.PreProgrammeTeaser — données du pré-programme privé (accès par token).
 *
 * Sécurité : token comparé en temps constant à PREPROGRAMME_TOKEN (env). On
 * n'expose JAMAIS les intervenants (on les compte uniquement) ni les horaires.
 *
 * target_audience_fr/en pas encore dans database.types.ts (migration 0104
 * appliquée après pnpm db:push) → service client casté en any pour ce select.
 *
 * Note 'use server' : exporte uniquement des fonctions async.
 */

import { timingSafeEqual } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import type {
  PreProgrammeConference,
  PreProgrammePole,
  PreProgrammePoleStat,
  PreProgrammeResult,
} from './types';

const asAnyDb = (c: ReturnType<typeof getSupabaseServiceClient>): SupabaseClient =>
  c as unknown as SupabaseClient;

function tokenValid(provided: string): boolean {
  const expected = process.env.PREPROGRAMME_TOKEN;
  if (!expected || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function getPreProgrammeAction(
  token: string,
  locale: 'fr' | 'en',
): Promise<PreProgrammeResult> {
  if (!token || !tokenValid(token)) {
    return { ok: false, reason: 'forbidden' };
  }

  const supabase = getSupabaseServiceClient();

  // 1. Conférences validées + publiées (avec target_audience via cast).
  const { data: confRows, error } = await asAnyDb(supabase)
    .from('conferences')
    .select(
      `id, title_fr, title_en, description_fr, description_en, program_track,
       conference_type, poles, target_audience_fr, target_audience_en,
       key_figures_fr, key_figures_en`,
    )
    .eq('is_validated', true)
    .eq('is_published', true);

  if (error || !confRows || confRows.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  const rows = confRows as Array<Record<string, unknown>>;

  // 2. Pôles (lookup code → nom localisé + couleur).
  const { data: poleRows } = await supabase
    .from('poles')
    .select('code, name_fr, name_en, color_hex');
  const poleMap = new Map<string, PreProgrammePole>(
    (poleRows ?? []).map((p) => [
      p.code as string,
      {
        code: p.code as string,
        name: (locale === 'en' ? p.name_en : p.name_fr) as string,
        colorHex: p.color_hex as string,
      },
    ]),
  );

  // 3. Compte des intervenants DISTINCTS (jamais leurs identités).
  const confIds = rows.map((r) => r.id as string);
  const { data: csRows } = await supabase
    .from('conference_speakers')
    .select('speaker_id')
    .in('conference_id', confIds);
  const speakerCount = new Set((csRows ?? []).map((r) => r.speaker_id as string)).size;

  // 4. Mapping localisé + répartition par pôle.
  const repartitionMap = new Map<string, PreProgrammePoleStat>();
  const toConf = (r: Record<string, unknown>): PreProgrammeConference => {
    const codes = (r.poles as string[] | null) ?? [];
    const poles = codes
      .map((code) => poleMap.get(code))
      .filter((p): p is PreProgrammePole => Boolean(p));
    for (const p of poles) {
      const existing = repartitionMap.get(p.code);
      if (existing) existing.count += 1;
      else repartitionMap.set(p.code, { ...p, count: 1 });
    }
    return {
      id: r.id as string,
      title: ((locale === 'en' ? r.title_en : r.title_fr) || r.title_fr) as string,
      description: (locale === 'en' ? r.description_en : r.description_fr) as string | null,
      conferenceType: (r.conference_type as string | null) ?? null,
      targetAudience:
        ((locale === 'en' ? r.target_audience_en : r.target_audience_fr) as string | null) ?? null,
      keyFigures: (() => {
        const en = (r.key_figures_en as string[] | null) ?? null;
        const fr = (r.key_figures_fr as string[] | null) ?? null;
        // EN si dispo (et non vide), sinon fallback FR.
        const chosen = locale === 'en' && en && en.length > 0 ? en : (fr ?? []);
        return chosen;
      })(),
      poles,
    };
  };

  const mds = rows.filter((r) => r.program_track !== 'prs_radio_audio').map(toConf);
  const prs = rows.filter((r) => r.program_track === 'prs_radio_audio').map(toConf);

  const repartition = [...repartitionMap.values()].sort((a, b) => b.count - a.count);

  return {
    ok: true,
    data: {
      kpis: {
        conferenceCount: rows.length,
        speakerCount,
        poleCount: repartition.length,
      },
      repartition,
      mds,
      prs,
    },
  };
}
