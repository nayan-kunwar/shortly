import Link from 'next/link';
import type { CreatedUrl } from '../types';
import { useAuth } from '../../auth/auth-context';
import { CopyButton } from './copy-button';

/** Success state (§7): short URL verbatim, copy, and onward link. */
export function CreateResult({ result, onReset }: { result: CreatedUrl; onReset: () => void }) {
  const { user } = useAuth();
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/30">
      <h2 className="font-semibold text-green-800 dark:text-green-300">URL created successfully</h2>
      <p className="mt-2 break-all font-mono text-sm">{result.shortUrl}</p>
      <p className="mt-1 break-all text-xs text-gray-500">→ {result.originalUrl}</p>
      {user === null && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Saved on this device.{' '}
          <Link href="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Create an account
          </Link>{' '}
          to keep your links everywhere.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={result.shortUrl} />
        <Link
          href={`/urls/${result.shortCode}`}
          className="inline-flex items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          View details
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
        >
          Create another
        </button>
      </div>
    </div>
  );
}
