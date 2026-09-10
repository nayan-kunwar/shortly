'use client';

import { use } from 'react';
import { useAnalytics } from '../../../../features/analytics/hooks/use-analytics';
import { AnalyticsSummary } from '../../../../features/analytics/components/analytics-summary';
import { BreakdownList } from '../../../../features/analytics/components/breakdown-list';
import { ClicksChart } from '../../../../features/analytics/components/clicks-chart';

/**
 * /urls/[shortCode]/analytics. States: loading skeleton, unavailable/error,
 * empty (zero clicks), and data. Manual refresh instead of polling — the
 * pipeline (M9–M11) is eventually consistent, and the note below says so.
 */
export default function AnalyticsPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = use(params);
  const query = useAnalytics(shortCode);

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
          className="mt-4 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
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
        <h1 className="text-2xl font-bold tracking-tight">
          Analytics <span className="font-mono text-lg text-gray-500">/{shortCode}</span>
        </h1>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-800 dark:hover:bg-gray-900"
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
      </p>
    </div>
  );
}
