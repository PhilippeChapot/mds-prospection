'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { SignupsPerDayPoint } from '@/lib/dashboard/charts';

export function ChartSignupsPerDay({ data }: { data: SignupsPerDayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value) => Number(value).toLocaleString('fr-FR')}
          labelFormatter={(value) => `Jour : ${String(value)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          name="Vérifié"
          dataKey="verified"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          name="Non vérifié"
          dataKey="notVerified"
          stroke="#9ca3af"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
