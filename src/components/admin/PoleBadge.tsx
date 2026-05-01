import { cn } from '@/lib/utils';
import { poleColor, poleEmoji, type PoleCode } from '@/lib/design-tokens';

const POLE_SHORT: Record<PoleCode, string> = {
  REGIES_RETAIL_MEDIA: 'Regies',
  AUDIO_RADIO: 'Audio',
  DIFFUSION_INFRA: 'Diffusion',
  VIDEO_CTV: 'Video',
  OUTDOOR_DOOH: 'Outdoor',
  DATA_ADTECH: 'Data',
  INCONNU: 'Non classe',
};

export function PoleBadge({
  code,
  withLabel = true,
  className,
}: {
  code: PoleCode;
  withLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-md-blue-dark inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        className,
      )}
      style={{ background: poleColor[code] }}
    >
      <span aria-hidden>{poleEmoji[code]}</span>
      {withLabel ? <span>{POLE_SHORT[code]}</span> : null}
    </span>
  );
}
