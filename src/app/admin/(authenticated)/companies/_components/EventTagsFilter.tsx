'use client';

/**
 * P5.x.CompaniesListEnrichments — filtre multi-select "Tag salon" (OR).
 * Persiste dans l'URL (?event_tags=prs,satis). Navigue à chaque toggle.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  EVENT_DISPLAY_ORDER,
  EVENT_DISPLAY_CONFIGS,
  type ExternalEventKey,
} from '@/lib/external-events/types';

export function EventTagsFilter({ selected }: { selected: ExternalEventKey[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggle(key: ExternalEventKey) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) params.set('event_tags', next.join(','));
    else params.delete('event_tags');
    params.delete('page'); // reset pagination
    router.push(`/admin/companies?${params.toString()}`);
  }

  const label = selected.length === 0 ? 'Tag salon' : `Tag salon · ${selected.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-md-border flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs"
      >
        {label}
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
      {open && (
        <div className="border-md-border absolute z-20 mt-1 w-48 rounded-md border bg-white p-1.5 shadow-lg">
          {EVENT_DISPLAY_ORDER.map((key) => {
            const cfg = EVENT_DISPLAY_CONFIGS[key];
            const checked = selected.includes(key);
            return (
              <label
                key={key}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(key)}
                  className="size-3.5"
                />
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.className}`}
                >
                  {cfg.emoji} {cfg.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
