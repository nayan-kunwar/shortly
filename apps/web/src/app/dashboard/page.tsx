'use client';

import Link from 'next/link';
import { BarChart3, Link2, MousePointerClick, Zap } from 'lucide-react';
import { useAuth } from '../../features/auth/auth-context';
import { CreateUrlForm } from '../../features/urls/components/create-url-form';
import { UrlTable } from '../../features/urls/components/url-table';
import { useUrls } from '../../features/urls/hooks/use-urls';
import { useStats } from '../../features/stats/hooks/use-stats';
import { useBreakdowns } from '../../features/stats/hooks/use-breakdowns';
import { BreakdownList } from '../../features/analytics/components/breakdown-list';

const STAT_ICONS = [Link2, Zap, MousePointerClick, BarChart3] as const;

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Link2;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <Icon size={15} aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      )}
    </div>
  );
}

/**
 * Dashboard: live stats, quick create (F2 form reused verbatim), recent
 * URLs, and global breakdowns.
 */
export default function DashboardPage() {
  const stats = useStats();
  const breakdowns = useBreakdowns();
  const recents = useUrls('', 5);
  const recentItems = recents.data?.pages[0]?.items ?? [];
  const { claimedCount, dismissClaimNotice } = useAuth();

  return (
    <div className="space-y-8">
      {claimedCount > 0 && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-900 dark:bg-brand-900/20 dark:text-brand-200"
        >
          {claimedCount} {claimedCount === 1 ? 'link' : 'links'} from your guest session{' '}
          {claimedCount === 1 ? 'was' : 'were'} moved to your account.
          <button type="button" onClick={dismissClaimNotice} className="font-medium underline">
            Dismiss
          </button>
        </p>
      )}
      <section aria-label="Statistics">
        {stats.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Statistics are temporarily unavailable.{' '}
            <button type="button" onClick={() => void stats.refetch()} className="underline">
              Try again
            </button>
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total URLs" value={stats.data?.totalUrls} icon={STAT_ICONS[0]} />
            <StatCard label="Active URLs" value={stats.data?.activeUrls} icon={STAT_ICONS[1]} />
            <StatCard label="Total clicks" value={stats.data?.totalClicks} icon={STAT_ICONS[2]} />
            <StatCard label="Clicks today" value={stats.data?.clicksToday} icon={STAT_ICONS[3]} />
          </div>
        )}
      </section>

      <section
        aria-label="Quick create"
        className="rounded-xl border border-line bg-surface p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold">Create a short URL</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Paste a long URL and get a short link instantly.
        </p>
        <div className="mt-4 max-w-xl">
          <CreateUrlForm />
        </div>
      </section>

      <section aria-label="Recent URLs">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent URLs</h2>
          <Link
            href="/urls"
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            View all
          </Link>
        </div>
        <div className="mt-3">
          {recents.isPending ? (
            <p className="text-sm text-gray-500">Loading recent URLs…</p>
          ) : recents.isError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Unable to load recent URLs.
            </p>
          ) : (
            <UrlTable items={recentItems} />
          )}
        </div>
      </section>

      <section aria-label="Breakdowns">
        <h2 className="text-lg font-semibold">Analytics breakdowns</h2>
        {breakdowns.isPending ? (
          <p className="mt-3 text-sm text-gray-500">Loading breakdowns…</p>
        ) : breakdowns.isError ? (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            Breakdowns are temporarily unavailable.
          </p>
        ) : breakdowns.data ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <BreakdownList title="Countries" data={breakdowns.data.countries} />
            <BreakdownList title="Devices" data={breakdowns.data.devices} />
            <BreakdownList title="Browsers" data={breakdowns.data.browsers} />
            <BreakdownList title="Referrers" data={breakdowns.data.referrers} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
