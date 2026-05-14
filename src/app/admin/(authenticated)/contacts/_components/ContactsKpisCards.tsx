import type { ContactsKpis } from '@/lib/contacts/admin-queries';

export function ContactsKpisCards({ kpis }: { kpis: ContactsKpis }) {
  const pctBrevo = kpis.total > 0 ? Math.round((kpis.brevoSynced / kpis.total) * 100) : 0;
  const pctLifecycle = kpis.total > 0 ? Math.round((kpis.lifecycleEnabled / kpis.total) * 100) : 0;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Total" value={kpis.total} tone="default" />
      <Stat label="Primary" value={kpis.primary} tone="default" />
      <Stat
        label="Brevo synced"
        value={kpis.brevoSynced}
        tone={pctBrevo >= 95 ? 'success' : 'warning'}
        delta={`${pctBrevo}%`}
      />
      <Stat label="Marketing opt-in" value={kpis.marketingOptIn} tone="default" />
      <Stat
        label="Lifecycle on"
        value={kpis.lifecycleEnabled}
        tone="default"
        delta={`${pctLifecycle}%`}
      />
      <Stat
        label="Sans email"
        value={kpis.withoutEmail}
        tone={kpis.withoutEmail > 0 ? 'warning' : 'default'}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  delta,
}: {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'warning';
  delta?: string;
}) {
  const toneCls =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-md-border bg-card';
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneCls}`}>
      <p className="text-md-text-muted text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="text-md-blue-deep font-display mt-1 text-xl font-extrabold tabular-nums">
        {value.toLocaleString('fr-FR')}
      </p>
      {delta ? <p className="text-md-text-muted mt-0.5 text-[10px]">{delta}</p> : null}
    </div>
  );
}
