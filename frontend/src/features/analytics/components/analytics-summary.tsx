import type { UrlAnalytics } from '../types';

/** Summary cards: total + today + last-7-days, derived from daily buckets. */
export function AnalyticsSummary({ data }: { data: UrlAnalytics }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const todayClicks = data.clicksByDay.find((d) => d.date === today)?.count ?? 0;
  const weekClicks = data.clicksByDay
    .filter((d) => d.date >= weekAgo)
    .reduce((sum, d) => sum + d.count, 0);

  const cards = [
    { label: 'Total clicks', value: data.totalClicks },
    { label: 'Today', value: todayClicks },
    { label: 'Last 7 days', value: weekClicks },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
        >
          <p className="text-sm text-gray-500">{card.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
