import { CATEGORY_COLOR_CLASSES, CATEGORY_LABELS, type TarifCategory } from '@/lib/tarifs/types';
import { cn } from '@/lib/utils';

export function CategoryBadge({
  category,
  subCategory,
  size = 'sm',
}: {
  category: TarifCategory;
  subCategory?: string | null;
  size?: 'sm' | 'xs';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold tracking-wide uppercase',
        CATEGORY_COLOR_CLASSES[category],
        size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]',
      )}
    >
      {CATEGORY_LABELS[category]}
      {subCategory ? (
        <>
          <span className="opacity-50">·</span>
          <span className="font-normal normal-case opacity-90">{subCategory}</span>
        </>
      ) : null}
    </span>
  );
}
