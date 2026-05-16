import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { ArrowRight, FileText, Receipt } from 'lucide-react';
import type { Locale } from 'next-intl';
import { requireEspaceExposantSession } from '@/lib/espace-exposant/session';
import { listSupplementaryOrdersForProspect } from '@/lib/espace-exposant/supplementary-orders/queries';
import { formatEurHt } from '@/lib/tarifs/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes commandes complémentaires — Espace Exposant' };

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente paiement', cls: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Payé', cls: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Échec', cls: 'bg-red-100 text-red-800' },
  expired: { label: 'Expiré', cls: 'bg-slate-100 text-slate-600' },
  refunded: { label: 'Remboursé', cls: 'bg-slate-200 text-slate-700' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtEurTtc(value: number): string {
  return formatEurHt(value).replace('HT', 'TTC');
}

export default async function CommandesListPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { prospectId } = await requireEspaceExposantSession(locale);
  const orders = await listSupplementaryOrdersForProspect(prospectId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
          <Receipt className="size-6" aria-hidden /> Mes commandes complémentaires
        </h1>
        <p className="text-md-text-muted mt-1 text-sm">
          Historique de vos commandes additionnelles (options, sponsorings, services).
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-12 text-center text-sm shadow-sm">
          <Receipt className="text-md-text-muted mx-auto mb-2 size-8" aria-hidden />
          <p>Aucune commande complémentaire pour le moment.</p>
          <Link
            href={`/${locale}/espace-exposant/dashboard/commander`}
            className="text-md-blue mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            Commander en plus
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total TTC</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Facture</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const st = STATUS_LABELS[o.status] ?? { label: o.status, cls: 'bg-slate-100' };
                return (
                  <tr key={o.id} className="border-md-border hover:bg-muted/30 border-t">
                    <td className="text-md-text px-4 py-3 text-xs">
                      {fmtDate(o.created_at)}
                      {o.paid_at ? (
                        <div className="text-md-text-muted text-[10px]">
                          Payé {fmtDate(o.paid_at)}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-md-text px-4 py-3 text-xs">
                      {o.item_count} produit{o.item_count > 1 ? 's' : ''}
                    </td>
                    <td className="text-md-text px-4 py-3 font-mono text-xs">
                      {fmtEurTtc(o.total_ttc_eur)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="text-md-text px-4 py-3 text-xs">
                      {o.sellsy_facture_number ? (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <FileText className="size-3" aria-hidden />
                          {o.sellsy_facture_number}
                        </span>
                      ) : (
                        <span className="text-md-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/espace-exposant/dashboard/commandes/${o.id}`}
                        className="text-md-blue text-xs font-semibold hover:underline"
                      >
                        Détail →
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
