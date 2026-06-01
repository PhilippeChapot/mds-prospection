/**
 * P5.x.ExternalEvents — composant ExternalEventBadges.
 *
 * Affiche les badges multi-events d une company a partir du JSONB
 * external_event_tags. Ordre fixe : PRS, MD Classic, RDE, SATIS, CBD.
 * Couleurs palette 5 (purple/orange/blue/green/yellow).
 *
 * Reutilise dans :
 *   - /admin/prospects (liste)
 *   - /admin/companies (liste + fiche detail)
 *   - /admin/signups (liste + detail)
 *   - fiche prospect detail
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  EVENT_DISPLAY_CONFIGS,
  EVENT_DISPLAY_ORDER,
  type ExternalEventKey,
} from '@/lib/external-events/types';

interface Props {
  tags: Record<string, unknown> | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  locale?: 'fr' | 'en';
}

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  xs: 'h-4 px-1.5 text-[10px]',
  sm: 'h-5 px-2 text-xs',
  md: 'h-6 px-2.5 text-sm',
};

function asYears(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((y) => Number.isFinite(y) && y > 2000 && y < 2100)
    .sort((a, b) => a - b);
}

export function ExternalEventBadges({ tags, size = 'sm', locale = 'fr' }: Props) {
  if (!tags || typeof tags !== 'object') return null;
  const map = tags as Record<string, unknown>;

  const items = EVENT_DISPLAY_ORDER.map((key) => ({ key, years: asYears(map[key]) })).filter(
    (entry) => entry.years.length > 0,
  );

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {items.map(({ key, years }) => {
        const cfg = EVENT_DISPLAY_CONFIGS[key as ExternalEventKey];
        const title = locale === 'en' ? cfg.titleEn : cfg.titleFr;
        return (
          <Badge
            key={key}
            variant="outline"
            className={cn(cfg.className, SIZE_CLASSES[size])}
            title={`${title} — ${years.join(', ')}`}
          >
            {cfg.emoji} {cfg.label} {years.join('/')}
          </Badge>
        );
      })}
    </div>
  );
}
