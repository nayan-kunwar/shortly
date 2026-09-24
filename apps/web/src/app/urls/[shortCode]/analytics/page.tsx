'use client';

import { use } from 'react';
import { useAnalytics } from '../../../../features/analytics/hooks/use-analytics';
import { useAnalyticsStream } from '../../../../features/analytics/hooks/use-analytics-stream';
import { AnalyticsSummary } from '../../../../features/analytics/components/analytics-summary';
import { BreakdownList } from '../../../../features/analytics/components/breakdown-list';
import { ClicksChart } from '../../../../features/analytics/components/clicks-chart';
import { LiveIndicator } from '../../../../features/analytics/components/live-indicator';

/**
 * /urls/[shortCode]/analytics. States: loading skeleton, unavailable/error,
 * empty (zero clicks), and data. SSE provides real-time updates; manual
 * refresh as fallback.
 */
export default function AnalyticsPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = use(params);
  const query = useAnalytics(shortCode);
  const { status: sseStatus } = useAnalyticsStream(shortCode);

  if (query.isPending) {
    return (
      <div aria-label="Loading analytics">
        <div className="h-7 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Could not load analytics for <span className="font-mono">{shortCode}</span>. The link may
          not exist, or the service is temporarily unavailable.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const data = query.data;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Analytics <span className="font-mono text-lg text-gray-500">/{shortCode}</span>
          </h1>
          <LiveIndicator status={sseStatus} />
        </div>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mt-6">
        <AnalyticsSummary data={data} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 font-semibold">Clicks over time</h2>
        <ClicksChart data={data.clicksByDay} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <BreakdownList title="Countries" data={data.countries} />
        <BreakdownList title="Devices" data={data.devices} />
        <BreakdownList title="Browsers" data={data.browsers} />
        <BreakdownList title="Referrers" data={data.referrers} />
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Clicks travel an async pipeline — recent clicks may take a few seconds to appear.
        {sseStatus === 'connected' && ' Real-time updates are active.'}
      </p>
    </div>
  );
}
