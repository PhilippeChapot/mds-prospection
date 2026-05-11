'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FunnelStep } from '@/lib/dashboard/charts';

const COLORS = ['#294294', '#3b5bb8', '#4f6fc2', '#6383cc', '#7896d6', '#10b981'];

export function ChartConversionFunnel({ data }: { data: FunnelStep[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 24, left: 24, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} width={120} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value) => Number(value).toLocaleString('fr-FR')}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx] ?? '#294294'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
