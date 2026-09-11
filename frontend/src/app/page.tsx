'use client';

import Link from 'next/link';
import { CreateUrlForm } from '../features/urls/components/create-url-form';
import { UrlTable } from '../features/urls/components/url-table';
import { useUrls } from '../features/urls/hooks/use-urls';
import { useStats } from '../features/stats/hooks/use-stats';

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <p className="text-sm text-gray-500">{label}</p>
      {value === undefined ? (
        <div className="mt-1 h-8 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      )}
    </div>
  );
}

/**
 * Dashboard: live stats, quick create (F2 form reused verbatim), recent
 * URLs. No "activity feed" — there is no backend event stream for one, and
 * inventing activity from thin air would violate the mock-data rule (§31).
 */
export default function Home() {
  const stats = useStats();
  const recents = useUrls('', 5);
  const recentItems = recents.data?.pages[0]?.items ?? [];

  return (
    <div className="space-y-8">
      <section aria-label="Statistics">
        {stats.isError ? (
          <p role="alert" className="text-sm text-red-600">
            Statistics are temporarily unavailable.{' '}
            <button type="button" onClick={() => void stats.refetch()} className="underline">
              Try again
            </button>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total URLs" value={stats.data?.totalUrls} />
            <StatCard label="Active URLs" value={stats.data?.activeUrls} />
            <StatCard label="Total clicks" value={stats.data?.totalClicks} />
            <StatCard label="Clicks today" value={stats.data?.clicksToday} />
          </div>
        )}
      </section>

      <section aria-label="Quick create" className="max-w-xl">
        <h2 className="text-lg font-semibold">Create a short URL</h2>
        <div className="mt-3">
          <CreateUrlForm />
        </div>
      </section>

      <section aria-label="Recent URLs">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent URLs</h2>
          <Link href="/urls" className="text-sm font-medium underline">
            View all
          </Link>
        </div>
        <div className="mt-3">
          {recents.isPending ? (
            <p className="text-sm text-gray-500">Loading recent URLs…</p>
          ) : recents.isError ? (
            <p role="alert" className="text-sm text-red-600">
              Unable to load recent URLs.
            </p>
          ) : (
            <UrlTable items={recentItems} />
          )}
        </div>
      </section>
    </div>
  );
}
