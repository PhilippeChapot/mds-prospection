'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { PoleDistributionPoint } from '@/lib/dashboard/charts';

const POLE_COLORS: Record<string, string> = {
  AUDIO_RADIO: '#294294',
  VIDEO_CTV: '#e6007e',
  REGIES_RETAIL_MEDIA: '#10b981',
  DIFFUSION_INFRA: '#f59e0b',
  DATA_ADTECH: '#6366f1',
  OUTDOOR_DOOH: '#ef4444',
  INCONNU: '#9ca3af',
};

export function ChartPoleDistribution({ data }: { data: PoleDistributionPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-md-text-muted flex h-[260px] items-center justify-center text-sm">
        Aucun prospect dans le pipeline.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.code} fill={POLE_COLORS[entry.code] ?? '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value) => Number(value).toLocaleString('fr-FR')}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
