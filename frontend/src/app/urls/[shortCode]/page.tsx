'use client';

import { use } from 'react';
import Link from 'next/link';
import { useUrl } from '../../../features/urls/hooks/use-urls';
import { CopyButton } from '../../../features/urls/components/copy-button';
import { DeactivateButton } from '../../../features/urls/components/deactivate-button';
import { UrlStatusBadge } from '../../../features/urls/components/url-status-badge';

/** /urls/[shortCode]: details, actions, onward analytics link (F4). */
export default function UrlDetailPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = use(params);
  const query = useUrl(shortCode);

  if (query.isPending) {
    return <p className="text-sm text-gray-500">Loading URL…</p>;
  }

  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        This link does not exist or could not be loaded.
      </p>
    );
  }

  const url = query.data;
  return (
    <div className="max-w-xl">
      <h1 className="break-all font-mono text-xl font-bold">{url.shortUrl}</h1>
      <p className="mt-1 break-all text-sm text-gray-600 dark:text-gray-400">{url.originalUrl}</p>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Status</dt>
          <dd className="mt-1">
            <UrlStatusBadge isActive={url.isActive} expiresAt={url.expiresAt} />
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Total clicks</dt>
          <dd className="mt-1 font-semibold tabular-nums">{url.clicks}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Created</dt>
          <dd className="mt-1">{new Date(url.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Expires</dt>
          <dd className="mt-1">
            {url.expiresAt === null ? 'Never' : new Date(url.expiresAt).toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-2">
        <CopyButton text={url.shortUrl} />
        <Link
          href={`/urls/${encodeURIComponent(url.shortCode)}/analytics`}
          className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
        >
          View analytics
        </Link>
        <DeactivateButton shortCode={url.shortCode} disabled={!url.isActive} />
      </div>
    </div>
  );
}
