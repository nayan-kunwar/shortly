import Link from 'next/link';

/** Unbuilt sections land here until their milestone ships. */
export default function NotFound() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Not built yet</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This section arrives in its milestone — or the link is simply unknown.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium underline">
        Back to dashboard
      </Link>
    </div>
  );
}
