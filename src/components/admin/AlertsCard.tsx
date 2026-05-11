import Link from 'next/link';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { loadUnresolvedAlerts } from '@/lib/dashboard/alerts-load';
import { MarkResolvedButton } from './MarkResolvedButton';

export async function AlertsCard() {
  // Fetch + format dans un helper non-component (Date.now interdit
  // pendant render d'un component meme server-side, cf. fix
  // P5.x.2.bis et P5.x.6).
  const alerts = await loadUnresolvedAlerts();

  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;

  if (alerts.length === 0) {
    return (
      <div className="bg-card border-md-border rounded-xl border p-4 text-sm shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-md-success">✓</span>
          <span className="text-md-text font-semibold">Aucune alerte active</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border-md-border rounded-xl border shadow-sm">
      <div className="border-md-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-md-text text-sm font-bold tracking-wide uppercase">Alertes pipeline</h2>
        <div className="flex items-center gap-3 text-xs font-medium">
          {critical > 0 ? (
            <span className="text-md-danger flex items-center gap-1">
              <AlertCircle className="size-3.5" aria-hidden />
              {critical} critical
            </span>
          ) : null}
          {warning > 0 ? (
            <span className="text-md-warning flex items-center gap-1">
              <AlertTriangle className="size-3.5" aria-hidden />
              {warning} warning{warning > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>
      <ul className="divide-md-border max-h-[420px] divide-y overflow-y-auto">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 shrink-0">
              {alert.severity === 'critical' ? (
                <AlertCircle className="text-md-danger size-4" aria-hidden />
              ) : (
                <AlertTriangle className="text-md-warning size-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-md-text text-sm">{alert.message}</p>
              <p className="text-md-text-muted mt-0.5 text-xs">
                {alert.relativeLabel} · {alert.kind}
                {alert.prospect_id ? (
                  <>
                    {' · '}
                    <Link
                      href={`/admin/prospects/${alert.prospect_id}`}
                      className="text-md-blue hover:underline"
                    >
                      Voir fiche
                    </Link>
                  </>
                ) : null}
                {alert.signup_id ? (
                  <>
                    {' · '}
                    <Link
                      href={`/admin/signups/${alert.signup_id}`}
                      className="text-md-blue hover:underline"
                    >
                      Voir signup
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <MarkResolvedButton alertId={alert.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
