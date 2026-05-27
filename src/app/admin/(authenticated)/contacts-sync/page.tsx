/**
 * /admin/contacts-sync — pilotage de la sync Brevo (P5.x.20).
 *
 * Affiche les compteurs (contacts total / synced / unsynced) et deux boutons :
 *   - Push next N contacts → Brevo
 *   - Pull contacts from Brevo (one-shot, admin only)
 *
 * Logs structurés côté server actions, retour toast côté client.
 */

import { redirect } from 'next/navigation';
import { Mail, ArrowRight, ArrowLeft, Search } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { countOrphanCompaniesWithDomain } from '@/lib/contacts/brevo-enrich';
import { SyncControls } from './SyncControls';
import { EnrichControls } from './EnrichControls';
import { hasAdminAccess } from '@/lib/auth/role-helpers';

export const metadata = { title: 'Sync Brevo — Contacts' };

export default async function ContactsSyncPage() {
  const profile = await requireAdminProfile();
  // P5.x.1-quater (bug #2) — sync Brevo : admin+ uniquement.
  if (!hasAdminAccess(profile.role)) {
    redirect('/admin?error=admin_only');
  }
  const supabase = await createSupabaseServerClient();

  const [{ count: total }, { count: synced }, { count: unsynced }, orphansWithDomain] =
    await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .not('brevo_contact_id', 'is', null),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('brevo_contact_id', null),
      countOrphanCompaniesWithDomain(),
    ]);

  const totalCount = total ?? 0;
  const syncedCount = synced ?? 0;
  const unsyncedCount = unsynced ?? 0;
  const pct = totalCount > 0 ? Math.round((syncedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
          <Mail className="size-6" aria-hidden /> Sync Brevo — Contacts
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Push DB → Brevo (création + liaison) et pull initial Brevo → DB. Le webhook temps réel
          arrive en P5.x.21.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Contacts en DB" value={totalCount} tone="default" />
        <Stat
          label="Synchronisés Brevo"
          value={syncedCount}
          deltaLabel={`${pct}% de couverture`}
          tone="success"
        />
        <Stat
          label="Reste à pousser"
          value={unsyncedCount}
          deltaLabel={unsyncedCount > 0 ? 'Cliquer "Push" ci-dessous' : 'Tout est sync'}
          tone={unsyncedCount > 0 ? 'warning' : 'default'}
        />
      </section>

      <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
        <h2 className="text-md-blue-dark mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
          <ArrowRight className="size-4" aria-hidden /> Push DB → Brevo
        </h2>
        <p className="text-md-text-muted mb-4 text-sm">
          Crée chaque contact DB sans <code>brevo_contact_id</code> dans la liste « MDS 2026 —
          Prospection Standard ». Si le contact existe déjà côté Brevo (matché par email), on
          récupère son ID sans écraser ses champs.
        </p>
        <SyncControls
          mode="push"
          adminOnly={false}
          canPull={hasAdminAccess(profile.role)}
          unsyncedCount={unsyncedCount}
        />
      </section>

      {hasAdminAccess(profile.role) ? (
        <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
            <ArrowLeft className="size-4" aria-hidden /> Pull Brevo → DB (one-shot)
          </h2>
          <p className="text-md-text-muted mb-4 text-sm">
            Récupère tous les contacts de la liste « MDS 2026 — Prospection Standard » dans Brevo et
            les rapatrie en DB. Si un email existe déjà côté DB → on lie. Sinon → on crée seulement
            si on trouve une company par domaine.
          </p>
          <SyncControls mode="pull" adminOnly canPull unsyncedCount={unsyncedCount} />
        </section>
      ) : (
        <section className="text-md-text-muted text-xs">
          Le pull Brevo → DB est réservé aux comptes admin.
        </section>
      )}

      {hasAdminAccess(profile.role) ? (
        <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark mb-3 flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
            <Search className="size-4" aria-hidden /> Enrichissement par domaine (P5.x.21)
          </h2>
          <p className="text-md-text-muted mb-4 text-sm">
            Pour chaque société sans contact en DB mais avec un{' '}
            <code className="text-md-text">primary_domain</code>, on scanne Brevo (~94 000 contacts)
            à la recherche d&apos;un email dont le domaine correspond. Si trouvé, on crée un contact
            générique en DB et on l&apos;ajoute à la liste « MDS 2026 — Prospection Standard ».
            Idempotent : ré-exécution = recalcul automatique des orphelines.
          </p>
          <div className="text-md-text-muted mb-4 text-xs">
            Sociétés orphelines avec domaine :{' '}
            <strong>{orphansWithDomain.toLocaleString('fr-FR')}</strong> · Durée estimée : 1-2 min
          </div>
          <EnrichControls orphansCount={orphansWithDomain} />
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  deltaLabel,
  tone,
}: {
  label: string;
  value: number;
  deltaLabel?: string;
  tone: 'default' | 'success' | 'warning';
}) {
  const toneCls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-md-border bg-card';
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneCls}`}>
      <p className="text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-md-blue-deep font-display mt-1 text-2xl font-extrabold tabular-nums">
        {value.toLocaleString('fr-FR')}
      </p>
      {deltaLabel ? <p className="text-md-text-muted mt-1 text-xs">{deltaLabel}</p> : null}
    </div>
  );
}
