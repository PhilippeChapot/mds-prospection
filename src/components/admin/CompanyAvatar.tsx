import { cn } from '@/lib/utils';

export function CompanyAvatar({
  initials,
  background,
  className,
}: {
  initials: string;
  background?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white',
        className,
      )}
      style={{ background: background ?? 'var(--color-md-blue)' }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
