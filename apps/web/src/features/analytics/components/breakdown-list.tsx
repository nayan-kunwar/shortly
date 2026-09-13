/** Ranked key→count rows with bar proportions (no map library needed). */
export function BreakdownList({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">No data yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {entries.map(([key, count]) => (
          <li key={key} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">{key}</span>
              <span className="tabular-nums text-gray-600 dark:text-gray-400">{count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-gray-100 dark:bg-gray-900">
              <div
                className="h-1.5 rounded bg-gray-700 dark:bg-gray-300"
                style={{ width: `${max === 0 ? 0 : Math.round((count / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
