/**
 * P16.x.PreProgrammeTeaser — répartition par pôle (barres horizontales
 * colorées par color_hex). Server component.
 */

import type { PreProgrammeLabels } from './labels';
import type { PreProgrammePoleStat } from '@/lib/public/preprogramme/types';

export function PreProgrammePolesRepartition({
  labels,
  repartition,
}: {
  labels: PreProgrammeLabels;
  repartition: PreProgrammePoleStat[];
}) {
  if (repartition.length === 0) return null;
  const max = Math.max(...repartition.map((p) => p.count), 1);
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display mb-8 text-center text-2xl font-bold text-[#1F2240]">
          {labels.repartitionTitle}
        </h2>
        <div className="space-y-4">
          {repartition.map((p) => (
            <div key={p.code}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-[#1F2240]">{p.name}</span>
                <span className="text-[#5A6080]">{p.count}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.round((p.count / max) * 100)}%`,
                    backgroundColor: p.colorHex,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
