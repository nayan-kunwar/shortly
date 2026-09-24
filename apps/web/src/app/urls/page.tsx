'use client';

import { useDeferredValue, useState } from 'react';
import { TextInput } from '../../components/ui/input';
import { useUrls } from '../../features/urls/hooks/use-urls';
import { UrlTable } from '../../features/urls/components/url-table';

/** /urls: search (deferred, not debounced) + cursor pages + states. */
export default function UrlsPage() {
  const [search, setSearch] = useState('');
  // Deferred value: typing stays responsive, queries fire on settled input.
  const deferredSearch = useDeferredValue(search);
  const query = useUrls(deferredSearch);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My URLs</h1>
      <div className="mt-4 max-w-md">
        <label htmlFor="url-search" className="sr-only">
          Search URLs
        </label>
        <TextInput
          id="url-search"
          type="search"
          placeholder="Search codes or destinations…"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {query.isPending ? (
          <p className="text-sm text-gray-500">Loading URLs…</p>
        ) : query.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Unable to load URLs. Please try again.
          </p>
        ) : (
          <>
            <UrlTable items={items} />
            {query.hasNextPage && (
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
