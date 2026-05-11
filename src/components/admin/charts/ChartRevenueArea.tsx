'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RevenueCumulativeResult } from '@/lib/dashboard/charts';

export function ChartRevenueArea({ data }: { data: RevenueCumulativeResult }) {
  const fmtEur = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data.points} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#294294" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#294294" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => fmtEur(value)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value) => fmtEur(Number(value))}
          labelFormatter={(value) => `Jour : ${String(value)}`}
        />
        <ReferenceLine
          y={data.target}
          stroke="#10b981"
          strokeDasharray="4 4"
          label={{
            value: `Objectif ${fmtEur(data.target)}`,
            position: 'insideTopRight',
            fontSize: 11,
            fill: '#10b981',
          }}
        />
        <Area
          type="monotone"
          dataKey="cumulativeTtc"
          stroke="#294294"
          strokeWidth={2}
          fill="url(#revenueGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
