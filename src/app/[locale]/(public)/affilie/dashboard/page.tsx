/**
 * Dashboard Espace Affilie (placeholder foundation) — P7.x.1.A
 *
 * Rend juste un welcome avec le display_name et un bouton de deconnexion.
 * Sections complete (Stats / Tracking links / Kit comm / Paiements / Profil)
 * livrees en P7.x.1.B.
 */

import { setRequestLocale } from 'next-intl/server';
import type { Locale } from 'next-intl';
import { requireAffilieSession } from '@/lib/affilie/session';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { LogOut } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon espace · Affilié MDS 2026' };

export default async function AffilieDashboardPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { affiliateId } = await requireAffilieSession(locale);

  const supabase = getSupabaseServiceClient();
  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, display_name, contact_email, token, type, commission_percent, last_login_at')
    .eq('id', affiliateId)
    .maybeSingle();

  return (
    <main className="bg-md-bg min-h-svh px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-md-magenta text-xs font-bold tracking-widest uppercase">
              Espace Affilié
            </p>
            <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
              Bonjour {affiliate?.display_name ?? 'partenaire'}
            </h1>
            <p className="text-md-text-muted mt-1 text-sm">
              MediaDays Solutions 2026 · Programme partenaires
            </p>
          </div>
          <form action="/api/affilie/logout" method="post">
            <button
              type="submit"
              className="border-md-border text-md-text hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              <LogOut className="size-3.5" aria-hidden /> Déconnexion
            </button>
          </form>
        </header>

        <section className="bg-card border-md-border space-y-3 rounded-2xl border p-6 shadow-sm">
          <h2 className="text-md-text text-base font-semibold">Identité affilié</h2>
          <dl className="text-sm">
            <Row label="Code partenaire" value={affiliate?.token ?? '—'} mono />
            <Row label="Email" value={affiliate?.contact_email ?? '—'} />
            <Row
              label="Type"
              value={
                affiliate?.type === 'media'
                  ? 'Média partenaire'
                  : affiliate?.type === 'referral'
                    ? 'Parrainage exposant'
                    : '—'
              }
            />
            <Row
              label="Commission"
              value={affiliate ? `${Number(affiliate.commission_percent).toFixed(2)} %` : '—'}
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <strong>Foundation P7.x.1.A</strong> — votre espace est opérationnel. Les sections
          complètes (statistiques live, liens tracking copiables, kit de communication, historique
          des paiements de commission, profil avec coordonnées bancaires) arriveront dans la
          livraison P7.x.1.B.
        </section>
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-md-border flex items-baseline justify-between gap-3 border-b py-2 last:border-0">
      <dt className="text-md-text-muted text-xs font-semibold">{label}</dt>
      <dd className={mono ? 'text-md-text font-mono text-sm' : 'text-md-text text-sm'}>{value}</dd>
    </div>
  );
}
