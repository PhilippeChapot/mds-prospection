/**
 * P5.x.ExternalEvents — page d arbitrage UI.
 *
 * Liste les companies external_events_review_status='unverified' groupees
 * par source (tabs MD Classic / RDE / SATIS / CBD). Chaque card permet :
 *   - Valider tel quel (status -> 'verified')
 *   - Ignorer (super_admin only, status -> 'ignored', delete contacts)
 *   - Fusionner avec une company suggeree (Levenshtein > 0.7)
 */

import { Suspense } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { ReviewClient } from './ReviewClient';
import type { ExternalEventSource } from '@/lib/external-events/types';

export const metadata = { title: 'Arbitrage events externes' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ tab?: string }>;

interface UnverifiedRow {
  id: string;
  name: string;
  source: ExternalEventSource;
  tags: Record<string, unknown>;
  contactCount: number;
}

const SOURCES: ExternalEventSource[] = ['md_classic', 'rde', 'satis', 'cbd'];

export default async function ExternalEventsReviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await requireAdminProfile();
  const params = await searchParams;
  const activeTab = (
    SOURCES.includes(params.tab as ExternalEventSource) ? params.tab : 'md_classic'
  ) as ExternalEventSource;

  const supabase = await createSupabaseServerClient();

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, external_events_review_source, external_event_tags')
    .eq('external_events_review_status', 'unverified')
    .order('name', { ascending: true });

  // Contact counts par company (one query, grouped).
  const companyIds = (companies ?? []).map((c) => c.id);
  const { data: contactRows } = companyIds.length
    ? await supabase.from('contacts').select('company_id').in('company_id', companyIds)
    : { data: [] };
  const countByCompany = new Map<string, number>();
  for (const r of contactRows ?? []) {
    const n = countByCompany.get(r.company_id) ?? 0;
    countByCompany.set(r.company_id, n + 1);
  }

  const allRows: UnverifiedRow[] = (companies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    source: c.external_events_review_source as ExternalEventSource,
    tags: (c.external_event_tags ?? {}) as Record<string, unknown>,
    contactCount: countByCompany.get(c.id) ?? 0,
  }));

  const counts: Record<ExternalEventSource, number> = {
    md_classic: 0,
    rde: 0,
    satis: 0,
    cbd: 0,
  };
  for (const row of allRows) counts[row.source]++;

  const filtered = allRows.filter((r) => r.source === activeTab);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
          📋 Arbitrage import événements externes
        </h1>
        <p className="text-md-text-muted text-sm">
          Companies importées sans match strict (statut <code>unverified</code>). À fusionner ou
          valider.
        </p>
      </header>

      <Suspense>
        <ReviewClient
          rows={filtered}
          activeTab={activeTab}
          counts={counts}
          canIgnore={profile.role === 'super_admin'}
        />
      </Suspense>
    </div>
  );
}
