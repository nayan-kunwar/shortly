'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayBucket } from '../types';

/** Clicks-over-time area chart. Client island (Recharts needs the DOM). */
export function ClicksChart({ data }: { data: DayBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-gray-800">
        No clicks yet. Clicks will appear here after people use your short URL.
      </div>
    );
  }
  return (
    <div className="h-64 w-full" data-testid="clicks-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Area type="monotone" dataKey="count" name="Clicks" fillOpacity={0.25} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
