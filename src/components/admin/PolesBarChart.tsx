import { poleColor, type PoleCode } from '@/lib/design-tokens';

export function PolesBarChart({
  data,
}: {
  data: { code: PoleCode; label: string; count: number }[];
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((row) => {
        const pct = Math.round((row.count / max) * 100);
        return (
          <div key={row.code} className="flex items-center gap-3 text-sm">
            <div className="w-44 shrink-0 truncate text-xs font-semibold">{row.label}</div>
            <div className="bg-md-bg relative h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, background: poleColor[row.code] }}
              />
            </div>
            <div className="text-md-text w-8 text-right text-xs font-bold">{row.count}</div>
          </div>
        );
      })}
    </div>
  );
}
