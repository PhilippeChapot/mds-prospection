import { cn } from '@/lib/utils';
import type { SyncTarget, SyncState } from '@/lib/mock/dashboard-data';

const TARGET_LABEL: Record<SyncTarget, string> = {
  sellsy: 'SE',
  brevo: 'BR',
  stripe: 'ST',
  canva: 'CA',
};

const STATE_CLASS: Record<SyncState, string> = {
  synced: 'bg-md-success text-white',
  pending: 'bg-md-warning text-white',
  idle: 'bg-muted text-md-text-muted',
};

const STATE_LABEL: Record<SyncState, string> = {
  synced: 'Synchronise',
  pending: 'En cours',
  idle: 'Non synchronise',
};

export function SyncBadges({
  syncs,
  className,
}: {
  syncs: { target: SyncTarget; state: SyncState }[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {syncs.map((s) => (
        <span
          key={s.target}
          title={`${s.target.toUpperCase()} : ${STATE_LABEL[s.state]}`}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md font-mono text-[9px] font-bold tracking-wider',
            STATE_CLASS[s.state],
          )}
        >
          {TARGET_LABEL[s.target]}
        </span>
      ))}
    </div>
  );
}
