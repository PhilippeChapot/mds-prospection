import { cn } from '@/lib/utils';
import type { ProspectStatus } from '@/lib/mock/dashboard-data';
import { PROSPECT_STATUS_LABEL_FR } from '@/lib/supabase/constants';

const STATUS_CLASS: Record<ProspectStatus, string> = {
  lead: 'bg-slate-100 text-slate-700',
  contact: 'bg-md-blue/10 text-md-blue',
  devis_envoye: 'bg-md-warning/15 text-md-warning',
  acompte_paye: 'bg-md-blue/15 text-md-blue-dark',
  paye_integral: 'bg-md-success/15 text-md-success',
  signe: 'bg-md-success/15 text-md-success',
  perdu: 'bg-md-danger/15 text-md-danger',
};

export function StatusPill({ status, className }: { status: ProspectStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        STATUS_CLASS[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {PROSPECT_STATUS_LABEL_FR[status]}
    </span>
  );
}
