import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, CheckCircle, FileText, Receipt } from 'lucide-react';
import type { Locale } from 'next-intl';
import { requireEspacePartenaireSession } from '@/lib/espace-partenaire/session';
import { getSupplementaryOrderDetail } from '@/lib/espace-partenaire/supplementary-orders/queries';
import { formatEurHt } from '@/lib/tarifs/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Détail commande — Espace Partenaire' };

interface PageProps {
  params: Promise<{ locale: Locale; id: string }>;
  searchParams: Promise<{ paid?: string }>;
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
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtEurTtc(value: number): string {
  return formatEurHt(value).replace('HT', 'TTC');
}

export default async function CommandeDetailPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const { prospectId } = await requireEspacePartenaireSession(locale);

  const order = await getSupplementaryOrderDetail(id, prospectId);
  if (!order) notFound();

  const st = STATUS_LABELS[order.status] ?? { label: order.status, cls: 'bg-slate-100' };
  const justPaid = sp.paid === '1' && order.status === 'paid';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/${locale}/espace-partenaire/dashboard/commandes`}
        className="text-md-text-muted inline-flex items-center gap-1 text-xs hover:underline"
      >
        <ArrowLeft className="size-3" aria-hidden />
        Retour aux commandes
      </Link>

      {justPaid ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
          <p className="text-md-text inline-flex items-center gap-2 font-semibold">
            <CheckCircle className="size-4 text-emerald-600" aria-hidden />
            Paiement confirmé ✓
          </p>
          <p className="text-md-text-muted mt-1 text-xs">
            Merci pour votre commande. Un email de confirmation vous a été envoyé. La facture Sellsy
            sera disponible sous peu (si pas encore visible ci-dessous).
          </p>
        </div>
      ) : null}

      <header>
        <h1 className="font-display text-md-blue-deep flex items-center gap-2 text-2xl font-bold">
          <Receipt className="size-6" aria-hidden /> Commande #{order.id.slice(0, 8)}
        </h1>
        <div className="text-md-text-muted mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>Créée le {fmtDate(order.created_at)}</span>
          <span>·</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${st.cls}`}
          >
            {st.label}
          </span>
          {order.paid_at ? (
            <>
              <span>·</span>
              <span>Payée le {fmtDate(order.paid_at)}</span>
            </>
          ) : null}
        </div>
      </header>

      {/* Items */}
      <section className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
            <tr>
              <th className="px-4 py-3">Produit</th>
              <th className="px-4 py-3">Qté × PU HT</th>
              <th className="px-4 py-3 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.sellsy_product_id} className="border-md-border border-t">
                <td className="px-4 py-3">
                  <div className="text-md-text font-medium">{it.name}</div>
                  <div className="text-md-text-muted font-mono text-[10px]">{it.reference}</div>
                </td>
                <td className="text-md-text px-4 py-3 text-xs">
                  {it.qty} × {formatEurHt(it.unit_price_ht)}
                </td>
                <td className="text-md-text px-4 py-3 text-right font-mono text-xs font-semibold">
                  {formatEurHt(it.line_total_ht)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="text-md-text-muted py-1">Total HT</td>
              <td className="py-1 text-right">{formatEurHt(order.total_ht_eur)}</td>
            </tr>
            <tr>
              <td className="text-md-text-muted py-1">TVA {order.vat_rate}%</td>
              <td className="py-1 text-right">
                {formatEurHt(order.total_ttc_eur - order.total_ht_eur)}
              </td>
            </tr>
            <tr className="border-md-border border-t">
              <td className="text-md-text py-2 font-bold">Total TTC</td>
              <td className="text-md-blue-deep py-2 text-right font-bold">
                {fmtEurTtc(order.total_ttc_eur)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Facture Sellsy */}
      {order.sellsy_facture_number ? (
        <section className="bg-card border-md-border rounded-xl border p-5 shadow-sm">
          <h2 className="text-md-blue-dark text-xs font-bold tracking-wider uppercase">Facture</h2>
          <p className="text-md-text mt-2 inline-flex items-center gap-2 font-mono text-sm">
            <FileText className="size-4" aria-hidden />
            {order.sellsy_facture_number}
          </p>
        </section>
      ) : order.status === 'paid' ? (
        <section className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs">
          <p className="text-md-text">
            <strong>Facture en cours de génération.</strong> Si elle n&apos;apparaît pas d&apos;ici
            quelques minutes, contactez-nous.
          </p>
        </section>
      ) : null}
    </div>
  );
}
