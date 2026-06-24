/**
 * P16.x.PreProgrammeTeaser — bande KPI (3 cards). Server component.
 */

import type { PreProgrammeLabels } from './labels';

export function PreProgrammeKpiBand({
  labels,
  kpis,
}: {
  labels: PreProgrammeLabels;
  kpis: { conferenceCount: number; speakerCount: number; poleCount: number };
}) {
  const items = [
    { value: kpis.conferenceCount, label: labels.kpiConf },
    { value: kpis.speakerCount, label: labels.kpiSpeakers },
    { value: kpis.poleCount, label: labels.kpiPoles },
  ];
  return (
    <section className="bg-[#1F2240] px-6 py-12">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center"
          >
            <div className="font-display text-5xl font-extrabold text-white">{it.value}</div>
            <div className="mt-2 text-sm tracking-wide text-white/60 uppercase">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
