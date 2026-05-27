import Link from 'next/link';
import { Plus, Mail, AlertCircle, CheckCircle2, Send, Clock, Archive, Ban } from 'lucide-react';
import { requireAdminProfile } from '@/lib/supabase/auth-helpers';
import { listCampaignsAction } from '@/lib/admin/campaigns/actions';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Campagnes' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  draft: { label: 'Brouillon', icon: Mail, color: 'bg-slate-100 text-slate-700' },
  scheduled: { label: 'Programmée', icon: Clock, color: 'bg-amber-100 text-amber-800' },
  sending: { label: 'En cours', icon: Send, color: 'bg-blue-100 text-blue-800' },
  sent: { label: 'Envoyée', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-800' },
  error: { label: 'Erreur', icon: AlertCircle, color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Annulée', icon: Ban, color: 'bg-zinc-100 text-zinc-600' },
  archived: { label: 'Archivée', icon: Archive, color: 'bg-zinc-100 text-zinc-600' },
};

export default async function CampaignsListPage() {
  await requireAdminProfile();
  const campaigns = await listCampaignsAction();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-md-blue-dark font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            💌 Campagnes
            <span className="text-md-text-muted ml-2 text-base font-medium">
              · {campaigns.length}
            </span>
          </h1>
          <p className="text-md-text-muted text-sm">
            Outil d&apos;envoi segmenté avec respect des préférences RGPD (P8.1).
          </p>
        </div>
        <Link
          href="/admin/campaigns/new"
          className="bg-md-magenta hover:bg-md-magenta-soft inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold text-white shadow-sm transition"
        >
          <Plus className="size-4" aria-hidden />
          Nouvelle campagne
        </Link>
      </header>

      {campaigns.length === 0 ? (
        <div className="border-md-border bg-card flex flex-col items-center gap-2 rounded-xl border p-10 text-center shadow-sm">
          <Mail className="text-md-text-muted size-8" aria-hidden />
          <p className="text-md-text-muted text-sm">Aucune campagne pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="border-md-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-md-text-muted text-[11px] font-bold tracking-wider uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Nom</th>
                <th className="px-3 py-2 text-left">Catégorie</th>
                <th className="px-3 py-2 text-left">Audience</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-right">Envoyés</th>
                <th className="px-3 py-2 text-right">Erreurs</th>
                <th className="px-3 py-2 text-left">Créé le</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const meta = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
                const Icon = meta.icon;
                return (
                  <tr key={c.id} className="border-md-border hover:bg-muted/30 border-t transition">
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        href={`/admin/campaigns/${c.id}`}
                        className="text-md-blue hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="text-md-text-muted px-3 py-2.5 text-xs">{c.category ?? '—'}</td>
                    <td className="text-md-text-muted px-3 py-2.5 text-xs">
                      {c.audience_key ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          meta.color,
                        )}
                      >
                        <Icon className="size-3" aria-hidden />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {c.sent_count} / {c.recipient_count}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">
                      {c.error_count > 0 ? (
                        <span className="text-md-danger">{c.error_count}</span>
                      ) : (
                        <span className="text-md-text-muted">—</span>
                      )}
                    </td>
                    <td className="text-md-text-muted px-3 py-2.5 text-xs">
                      {new Date(c.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/admin/campaigns/${c.id}`}
                        className="text-md-magenta text-xs font-semibold hover:underline"
                      >
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
