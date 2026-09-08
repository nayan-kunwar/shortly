import Link from 'next/link';

const UPCOMING = [
  { href: '/create', title: 'Create URLs', body: 'Shorten links with custom aliases (F2).' },
  { href: '/urls', title: 'Manage URLs', body: 'Search, inspect, deactivate (F3).' },
];

/** Dashboard shell. Live stats arrive in F5; cards link to routed sections. */
export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Shorten URLs, manage links, and explore click analytics.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {UPCOMING.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-gray-200 p-5 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/50"
          >
            <h2 className="font-semibold">{card.title}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
