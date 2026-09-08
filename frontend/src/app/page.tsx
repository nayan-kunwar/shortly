export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Shortly</h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        URL shortener dashboard. F0 foundation is in place — the application shell lands in F1, URL
        creation in F2.
      </p>
      <p className="mt-6 text-sm text-gray-500">
        Backend API: <code>{process.env['NEXT_PUBLIC_API_URL'] ?? 'not configured'}</code>
      </p>
    </main>
  );
}
