/**
 * P5.x.ExternalEvents — alerte interne quand un signup matche une
 * company avec des external_event_tags.
 *
 * Cree une conversation `staff_broadcast` priority='high' visible par
 * tout le staff dans /admin/messages. Le sujet liste les events.
 *
 * Aucune PII destinataire (juste id signup + nom company publique + id
 * matched events). RGPD safe.
 *
 * Best-effort : un echec ici ne doit jamais bloquer la conversion ou
 * un autre workflow. Log et continue.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { EVENT_DISPLAY_CONFIGS, type ExternalEventKey } from './types';

interface TriggerArgs {
  signupId: string;
  signupEmail: string;
  signupFirstName: string | null;
  signupLastName: string | null;
  companyId: string;
  companyName: string;
  externalEventTags: Record<string, unknown> | null;
  baseUrl?: string;
}

export async function triggerExternalEventSignupAlert(args: TriggerArgs): Promise<void> {
  if (!args.externalEventTags || typeof args.externalEventTags !== 'object') return;

  const matched = Object.entries(args.externalEventTags).flatMap(([key, value]) => {
    if (!Array.isArray(value) || value.length === 0) return [];
    const years = value
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    if (years.length === 0) return [];
    return [{ key, years }];
  });

  if (matched.length === 0) return;

  const supabase = getSupabaseServiceClient();

  const eventsSummary = matched
    .map(({ key, years }) => {
      const cfg = EVENT_DISPLAY_CONFIGS[key as ExternalEventKey];
      return `${cfg?.label ?? key.toUpperCase()} ${years.join('/')}`;
    })
    .join(', ');

  const subject = `⚠️ Signup prioritaire : ${args.companyName} (${eventsSummary})`;

  const contactDisplay = [args.signupFirstName, args.signupLastName].filter(Boolean).join(' ');
  const baseUrl = args.baseUrl ?? process.env.APP_URL ?? 'https://mediadays.solutions';

  const bodyLines: string[] = [];
  bodyLines.push(
    `Le signup de ${contactDisplay || args.signupEmail} concerne ${args.companyName}, presente sur ${matched.length} evenement(s) externe(s) :`,
  );
  bodyLines.push('');
  for (const { key, years } of matched) {
    const cfg = EVENT_DISPLAY_CONFIGS[key as ExternalEventKey];
    const title = cfg?.titleFr ?? key;
    bodyLines.push(`- ${title} : ${years.join(', ')}`);
  }
  bodyLines.push('');
  bodyLines.push('Prospect a traiter en priorite — argumentaire personnalise recommande.');
  bodyLines.push('');
  bodyLines.push(`Fiche signup : ${baseUrl}/admin/signups/${args.signupId}`);
  bodyLines.push(`Fiche company : ${baseUrl}/admin/companies/${args.companyId}`);
  const body = bodyLines.join('\n');

  // 1. Insert conversation staff_broadcast priority='high'.
  const { data: conv, error: convErr } = await supabase
    .from('internal_conversations')
    .insert({
      type: 'staff_broadcast',
      subject,
      created_by_type: 'user',
      // created_by_id : sentinelle 'system' impossible (uuid). On utilise
      // l UUID nil. created_by_id reste informatif - la conv est broadcast.
      created_by_id: '00000000-0000-0000-0000-000000000000',
      priority: 'high',
      metadata: {
        source: 'signup_external_event_match',
        signup_id: args.signupId,
        company_id: args.companyId,
        matched_events: Object.fromEntries(matched.map(({ key, years }) => [key, years])),
      },
    })
    .select('id')
    .single();

  if (convErr || !conv) {
    console.error('[external-events:signup-alert] insert conversation failed', convErr);
    return;
  }

  // 2. Insert staff_pool participant (la conv est visible pour tout le
  // staff via RLS is_admin_or_sales - staff_pool sert de marqueur).
  await supabase.from('conversation_participants').insert({
    conversation_id: conv.id,
    participant_type: 'staff_pool',
    participant_id: null,
  });

  // 3. Insert message (le body est ecrit au nom de 'system' user nil).
  await supabase.from('internal_messages').insert({
    conversation_id: conv.id,
    sender_type: 'user',
    sender_id: '00000000-0000-0000-0000-000000000000',
    body,
  });
}
