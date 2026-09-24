import type { UrlAnalytics } from '../types';

/** Summary cards: total + today + this week + last 7 days + this month, derived from daily buckets. */
export function AnalyticsSummary({ data }: { data: UrlAnalytics }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Last 7 days (rolling window)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // This week: Monday–Sunday (ISO week)
  const dayOfWeek = now.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(now.getTime() - mondayOffset * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // This month: 1st to today
  const thisMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
    .toISOString()
    .slice(0, 10);

  const todayClicks = data.clicksByDay.find((d) => d.date === today)?.count ?? 0;
  const thisWeekClicks = data.clicksByDay
    .filter((d) => d.date >= thisWeekStart)
    .reduce((sum, d) => sum + d.count, 0);
  const last7DaysClicks = data.clicksByDay
    .filter((d) => d.date >= weekAgo)
    .reduce((sum, d) => sum + d.count, 0);
  const thisMonthClicks = data.clicksByDay
    .filter((d) => d.date >= thisMonthStart)
    .reduce((sum, d) => sum + d.count, 0);

  const cards = [
    { label: 'Total clicks', value: data.totalClicks },
    { label: 'Today', value: todayClicks },
    { label: 'This week', value: thisWeekClicks },
    { label: 'Last 7 days', value: last7DaysClicks },
    { label: 'This month', value: thisMonthClicks },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-line bg-surface p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="text-sm text-gray-500">{card.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
