/**
 * loadUnresolvedAlerts — P5.x.11
 *
 * Helper non-component utilise par AlertsCard (Server Component).
 * Isole le `Date.now()` ici car la regle ESLint react-hooks/purity
 * interdit l'appel pendant le render meme cote server component
 * (cf. fix P5.x.2.bis dashboard exposant).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AlertRowEnriched {
  id: string;
  kind: string;
  severity: 'warning' | 'critical';
  prospect_id: string | null;
  signup_id: string | null;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
  relativeLabel: string;
}

export async function loadUnresolvedAlerts(limit = 50): Promise<AlertRowEnriched[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('admin_alerts')
    .select('id, kind, severity, prospect_id, signup_id, message, details, created_at')
    .is('resolved_at', null)
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  const raw = (data ?? []) as Array<Omit<AlertRowEnriched, 'relativeLabel'>>;

  // Tri manuel : critical d'abord pour ne pas dependre du tri alpha SQL.
  raw.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });

  // Date.now() OK ici (fonction async non-component) — la regle
  // react-hooks/purity ne s'applique qu'aux render d'un component.
  const nowMs = Date.now();
  return raw.map((a) => ({
    ...a,
    relativeLabel: formatRelative(a.created_at, nowMs),
  }));
}

function formatRelative(iso: string, nowMs: number): string {
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 60_000) return "à l'instant";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  return `il y a ${day} j`;
}
