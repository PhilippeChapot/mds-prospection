import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'accent' | 'warning' | 'success';
type DeltaTone = 'up' | 'down' | 'neutral';

const TONE_BORDER: Record<Tone, string> = {
  default: 'border-md-border',
  accent: 'border-md-magenta/40',
  warning: 'border-md-warning/40',
  success: 'border-md-success/40',
};

const TONE_LABEL: Record<Tone, string> = {
  default: 'text-md-text-muted',
  accent: 'text-md-magenta',
  warning: 'text-md-warning',
  success: 'text-md-success',
};

const DELTA_TONE: Record<DeltaTone, string> = {
  up: 'text-md-success',
  down: 'text-md-danger',
  neutral: 'text-md-text-muted',
};

const DELTA_ICON: Record<DeltaTone, React.ComponentType<{ className?: string }>> = {
  up: ArrowUp,
  down: ArrowDown,
  neutral: Minus,
};

export function KpiCard({
  label,
  value,
  deltaLabel,
  deltaTone = 'neutral',
  tone = 'default',
}: {
  label: string;
  value: number | string;
  deltaLabel?: string;
  deltaTone?: DeltaTone;
  tone?: Tone;
}) {
  const Icon = DELTA_ICON[deltaTone];
  return (
    <div
      className={cn(
        'bg-card rounded-xl border p-4 shadow-sm transition hover:shadow-md',
        TONE_BORDER[tone],
      )}
    >
      <div className={cn('text-[10px] font-bold tracking-widest uppercase', TONE_LABEL[tone])}>
        {label}
      </div>
      <div className="text-md-text mt-2 font-[family-name:var(--font-montserrat)] text-3xl font-extrabold">
        {value}
      </div>
      {deltaLabel ? (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            DELTA_TONE[deltaTone],
          )}
        >
          <Icon className="size-3" aria-hidden />
          <span>{deltaLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
