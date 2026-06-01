/**
 * P8.5 — page admin /admin/lifecycle (super_admin only pour toggle,
 * admin+ pour edit / dry-run / translate).
 *
 * Liste les 8 regles avec :
 *   - Toggle ON/OFF (super_admin)
 *   - Derniere execution + compteur candidats/queued
 *   - Total envoyes 7j + echecs 7j (depuis lifecycle_send_queue)
 *   - Boutons : Dry-run, Editer, Historique, Re-cibler
 */

import { redirect } from 'next/navigation';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { hasAdminAccess } from '@/lib/auth/role-helpers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { LifecycleClient, type LifecycleRuleView } from './LifecycleClient';

export const metadata = { title: 'Lifecycle relances' };
export const dynamic = 'force-dynamic';

export default async function LifecyclePage() {
  const profile = await requireAdminProfile();
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }

  const supabase = getSupabaseServiceClient();

  const { data: rules } = await supabase
    .from('lifecycle_rules')
    .select(
      'id, rule_key, label_fr, label_en, description_fr, description_en, pref_category, is_active, cron_schedule, subject_fr, subject_en, body_fr_html, body_en_html, en_translated_by_ai_at, fr_translated_by_ai_at, updated_at',
    )
    .order('cron_schedule', { ascending: true });

  // Aggregate stats par regle (derniere exec + counts 7j).
  // eslint-disable-next-line react-hooks/purity -- Server Component async, pas un render React pur
  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: lastExecs } = await supabase
    .from('lifecycle_executions')
    .select('rule_id, executed_at, candidates_count, queued_count')
    .gte('executed_at', sinceIso)
    .order('executed_at', { ascending: false });

  const lastExecByRule = new Map<
    string,
    { executed_at: string; candidates_count: number; queued_count: number }
  >();
  for (const e of lastExecs ?? []) {
    if (!lastExecByRule.has(e.rule_id)) {
      lastExecByRule.set(e.rule_id, {
        executed_at: e.executed_at,
        candidates_count: e.candidates_count,
        queued_count: e.queued_count,
      });
    }
  }

  const { data: sendStats7d } = await supabase
    .from('lifecycle_send_queue')
    .select('rule_id, status')
    .gte('created_at', sinceIso);
  const statsByRule = new Map<string, { sent: number; error: number; pending: number }>();
  for (const s of sendStats7d ?? []) {
    const cur = statsByRule.get(s.rule_id) ?? { sent: 0, error: 0, pending: 0 };
    if (s.status === 'sent') cur.sent++;
    else if (s.status === 'error') cur.error++;
    else if (s.status === 'pending') cur.pending++;
    statsByRule.set(s.rule_id, cur);
  }

  const views: LifecycleRuleView[] = (rules ?? []).map((r) => ({
    rule_key: r.rule_key,
    label_fr: r.label_fr,
    label_en: r.label_en,
    description_fr: r.description_fr ?? null,
    description_en: r.description_en ?? null,
    pref_category: r.pref_category,
    is_active: r.is_active,
    cron_schedule: r.cron_schedule,
    subject_fr: r.subject_fr,
    subject_en: r.subject_en,
    body_fr_html: r.body_fr_html,
    body_en_html: r.body_en_html,
    en_translated_by_ai_at: r.en_translated_by_ai_at,
    fr_translated_by_ai_at: r.fr_translated_by_ai_at,
    updated_at: r.updated_at,
    last_execution: lastExecByRule.get(r.id) ?? null,
    stats_7d: statsByRule.get(r.id) ?? { sent: 0, error: 0, pending: 0 },
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          🔁 Relances automatiques
        </h1>
        <p className="text-md-text-muted text-sm">
          8 règles de relance lifecycle pilotées par pg_cron + Vercel Cron. RGPD strict : respect
          des préférences contact + exclusion <code>email_confidence=low</code> hors billing.{' '}
          <strong>Toggle ON/OFF réservé super_admin</strong>.
        </p>
      </header>

      <LifecycleClient rules={views} canToggle={profile.role === 'super_admin'} />
    </div>
  );
}
