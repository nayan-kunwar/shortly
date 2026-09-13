import Link from 'next/link';
import type { UrlListItem } from '../types';
import { CopyButton } from './copy-button';
import { UrlStatusBadge } from './url-status-badge';

function formatDate(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Presentational table (desktop) / cards (mobile via horizontal scroll). */
export function UrlTable({ items }: { items: UrlListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-8 text-center dark:border-gray-800">
        <p className="font-medium">No shortened URLs yet.</p>
        <p className="mt-1 text-sm text-gray-500">Create your first short URL to get started.</p>
        <Link
          href="/create"
          className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-900"
        >
          Create short URL
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
            <th scope="col" className="px-4 py-3 font-medium">
              Short URL
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Destination
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Clicks
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Created
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Expires
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.shortCode}
              className="border-b border-gray-100 last:border-0 dark:border-gray-900"
            >
              <td className="px-4 py-3 font-mono text-xs">{item.shortUrl}</td>
              <td className="max-w-[240px] truncate px-4 py-3 text-gray-600 dark:text-gray-400">
                {item.originalUrl}
              </td>
              <td className="px-4 py-3 tabular-nums">{item.clicks}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatDate(item.createdAt)}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatDate(item.expiresAt)}
              </td>
              <td className="px-4 py-3">
                <UrlStatusBadge isActive={item.isActive} expiresAt={item.expiresAt} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <CopyButton text={item.shortUrl} />
                  <Link
                    href={`/urls/${encodeURIComponent(item.shortCode)}`}
                    className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
                  >
                    View
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
