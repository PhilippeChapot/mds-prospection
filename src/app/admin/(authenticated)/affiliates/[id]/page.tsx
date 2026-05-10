import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAffiliateDetail } from '@/lib/affiliates/queries';
import { archiveAffiliateAction, unarchiveAffiliateAction } from '../actions';
import { MarkPaidButton } from './MarkPaidButton';
import { CopyButtonClient } from './CopyButtonClient';

export const metadata = { title: 'Détail affilié' };
export const dynamic = 'force-dynamic';

const fmtEur = (eur: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(eur);

const fmtEur2 = (eur: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(eur);

const fmtDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(iso),
      )
    : '—';

export default async function AffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getAffiliateDetail(id);
  if (!detail) notFound();

  const { affiliate, prospects } = detail;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.mediadays.solutions';
  const trackingUrl = `${baseUrl}/fr/inscription-exposant?ref=${affiliate.token}`;

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/affiliates">
            <ArrowLeft className="size-4" aria-hidden />
            Retour à la liste
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-md-magenta text-xs font-bold tracking-widest uppercase">
            Affilié {affiliate.type === 'media' ? '· Média partenaire' : '· Parrainage'}
          </p>
          <h1 className="text-md-text font-[family-name:var(--font-montserrat)] text-2xl font-extrabold tracking-tight">
            {affiliate.displayName}
          </h1>
          {affiliate.contactEmail ? (
            <p className="text-md-text-muted text-sm">{affiliate.contactEmail}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {affiliate.isActive ? (
            <form
              action={async () => {
                'use server';
                await archiveAffiliateAction(affiliate.id);
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                <Archive className="size-4" aria-hidden />
                Archiver
              </Button>
            </form>
          ) : (
            <form
              action={async () => {
                'use server';
                await unarchiveAffiliateAction(affiliate.id);
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                <ArchiveRestore className="size-4" aria-hidden />
                Réactiver
              </Button>
            </form>
          )}
        </div>
      </div>

      <Card className="border-md-border space-y-3 p-5 shadow-sm">
        <h2 className="text-md-text-muted text-[10px] font-bold tracking-widest uppercase">
          Lien de tracking
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-muted text-md-text flex-1 truncate rounded px-3 py-2 text-xs">
            {trackingUrl}
          </code>
          <CopyTrackingButton url={trackingUrl} />
        </div>
        <p className="text-md-text-muted text-xs">
          Code: <strong className="font-mono">{affiliate.token}</strong> · Commission:{' '}
          <strong>{affiliate.commissionPercent.toFixed(2)} %</strong>
        </p>
      </Card>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Signups" value={affiliate.signupsCount.toString()} tone="default" />
        <Stat
          label="Convertis"
          value={`${affiliate.convertedCount} / ${affiliate.prospectsCount}`}
          tone="default"
        />
        <Stat
          label="Commission cumulée"
          value={fmtEur(affiliate.commissionTotalEur)}
          tone="accent"
        />
        <Stat
          label="À payer"
          value={fmtEur(affiliate.commissionDueEur)}
          tone={affiliate.commissionDueEur > 0 ? 'warning' : 'default'}
        />
      </section>

      <section>
        <h2 className="text-md-text-muted mb-2 text-[11px] font-bold tracking-widest uppercase">
          Prospects rattachés ({prospects.length})
        </h2>
        {prospects.length === 0 ? (
          <div className="bg-card border-md-border text-md-text-muted rounded-xl border p-6 text-center text-sm shadow-sm">
            Aucun prospect attribué pour l&apos;instant.
          </div>
        ) : (
          <div className="bg-card border-md-border overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-md-text-muted text-[11px] font-semibold tracking-wider uppercase">
                  <tr>
                    <th className="px-4 py-3">Société</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Devis</th>
                    <th className="px-4 py-3 text-right">Total TTC</th>
                    <th className="px-4 py-3 text-right">Commission HT</th>
                    <th className="px-4 py-3">Commission</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((p) => (
                    <tr key={p.id} className="border-md-border hover:bg-muted/20 border-t">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/prospects/${p.id}`}
                          className="text-md-text hover:text-md-blue font-semibold hover:underline"
                        >
                          {p.companyName}
                        </Link>
                      </td>
                      <td className="text-md-text-muted px-4 py-3 font-mono text-xs">{p.status}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sellsyDevisNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {p.sellsyDevisTotalTtc != null ? fmtEur(p.sellsyDevisTotalTtc) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {p.commissionEurHt != null ? fmtEur2(p.commissionEurHt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.commissionStatus === 'paid' ? (
                          <span className="text-md-success">
                            ✅ Payée le {fmtDate(p.commissionPaidAt)}
                            {p.commissionPaymentReference ? (
                              <span className="text-md-text-muted ml-1">
                                ({p.commissionPaymentReference})
                              </span>
                            ) : null}
                          </span>
                        ) : p.commissionStatus === 'due' ? (
                          <span className="text-md-warning">⏳ Due</span>
                        ) : (
                          <span className="text-md-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.commissionStatus === 'due' &&
                        p.commissionEurHt &&
                        p.commissionEurHt > 0 ? (
                          <MarkPaidButton prospectId={p.id} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'accent' | 'warning';
}) {
  const toneCls =
    tone === 'accent'
      ? 'border-md-magenta/40'
      : tone === 'warning'
        ? 'border-md-warning/40'
        : 'border-md-border';
  const labelCls =
    tone === 'accent'
      ? 'text-md-magenta'
      : tone === 'warning'
        ? 'text-md-warning'
        : 'text-md-text-muted';
  return (
    <div className={`bg-card rounded-xl border p-4 shadow-sm ${toneCls}`}>
      <div className={`text-[10px] font-bold tracking-widest uppercase ${labelCls}`}>{label}</div>
      <div className="text-md-text mt-2 font-[family-name:var(--font-montserrat)] text-2xl font-extrabold">
        {value}
      </div>
    </div>
  );
}

function CopyTrackingButton({ url }: { url: string }) {
  return <CopyButtonClient url={url} />;
}
