'use client';

import Link from 'next/link';
import { Zap, BarChart3, Tag } from 'lucide-react';
import { CreateUrlForm } from '../features/urls/components/create-url-form';
import { useStats } from '../features/stats/hooks/use-stats';

const FEATURES = [
  { icon: Zap, label: 'Fast redirects', desc: 'Sub-50ms redirects via Redis cache' },
  { icon: BarChart3, label: 'Click analytics', desc: 'Track countries, devices, browsers' },
  { icon: Tag, label: 'Custom aliases', desc: 'Choose your own short codes' },
] as const;

export default function HomePage() {
  const stats = useStats();

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full max-w-2xl space-y-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Make every link shorter
        </h1>
        <p className="mx-auto max-w-md text-gray-500 dark:text-gray-400">
          Paste a long URL, get a short one. Track every click.
        </p>
      </section>

      {/* Create form */}
      <section className="w-full max-w-xl" aria-label="Create a short URL">
        <CreateUrlForm />
      </section>

      {/* Features */}
      <section className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-900">
              <Icon size={20} className="text-gray-600 dark:text-gray-400" />
            </div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
          </div>
        ))}
      </section>

      {/* Stats + CTA */}
      <section className="mt-16 flex flex-col items-center gap-4">
        {!stats.isError && stats.data !== undefined && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold tabular-nums">{stats.data.totalUrls}</span> URLs
            shortened
            {' · '}
            <span className="font-semibold tabular-nums">{stats.data.totalClicks}</span> clicks
            tracked
          </p>
        )}
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-500 underline hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          Open dashboard →
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-200 py-6 dark:border-gray-800">
        <p className="text-center text-xs text-gray-400">
          Built with Express, PostgreSQL, Redis, and RabbitMQ
        </p>
      </footer>
    </div>
  );
}
