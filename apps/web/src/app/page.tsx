'use client';

import Link from 'next/link';
import {
  Zap,
  BarChart3,
  Tag,
  ArrowRight,
  Globe,
  MousePointerClick,
  Link2,
  Database,
  Server,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { CreateUrlForm } from '../features/urls/components/create-url-form';
import { useStats } from '../features/stats/hooks/use-stats';
import { Logo } from '../components/ui/logo';

/* ------------------------------------------------------------------ */
/*  Feature cards                                                      */
/* ------------------------------------------------------------------ */
const FEATURES = [
  {
    icon: Zap,
    title: 'Lightning-fast redirects',
    desc: 'Sub-50ms redirects powered by Redis caching. Your users never wait.',
    color: 'from-amber-500/10 to-orange-500/10 dark:from-amber-500/5 dark:to-orange-500/5',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: BarChart3,
    title: 'Powerful analytics',
    desc: 'Understand clicks, countries, devices, browsers, and traffic patterns in real time.',
    color: 'from-blue-500/10 to-indigo-500/10 dark:from-blue-500/5 dark:to-indigo-500/5',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Tag,
    title: 'Custom aliases',
    desc: 'Create memorable short URLs using your own aliases. Make every link yours.',
    color: 'from-purple-500/10 to-pink-500/10 dark:from-purple-500/5 dark:to-pink-500/5',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  How it works steps                                                 */
/* ------------------------------------------------------------------ */
const STEPS = [
  { num: '01', title: 'Paste your URL', desc: 'Enter any long URL into the shortener.' },
  { num: '02', title: 'Create your short link', desc: 'Generate a fast, memorable link instantly.' },
  { num: '03', title: 'Track every click', desc: 'Monitor performance with real-time analytics.' },
] as const;

/* ------------------------------------------------------------------ */
/*  Tech stack                                                         */
/* ------------------------------------------------------------------ */
const TECH = [
  { name: 'Express', desc: 'Fast, minimal API layer' },
  { name: 'PostgreSQL', desc: 'Reliable persistent storage' },
  { name: 'Redis', desc: 'Sub-millisecond cache lookups' },
  { name: 'RabbitMQ', desc: 'Async event processing' },
] as const;

/* ------------------------------------------------------------------ */
/*  Reusable section wrapper                                           */
/* ------------------------------------------------------------------ */
function Section({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const stats = useStats();

  return (
    <div className="overflow-hidden">
      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <Section className="relative pt-20 pb-8 sm:pt-28 sm:pb-12">
        {/* Subtle background gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-gray-100/80 to-transparent blur-3xl dark:from-gray-900/50" />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="animate-fade-in-up mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            <Activity size={14} className="text-green-500" />
            Open-source URL shortener
          </div>

          {/* Headline */}
          <h1 className="animate-fade-in-up animation-delay-100 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Short links.{' '}
            <span className="gradient-text">Powerful analytics.</span>
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-in-up animation-delay-200 mx-auto mt-6 max-w-xl text-lg text-gray-500 dark:text-gray-400">
            Create short, memorable links and understand exactly how
            they&apos;re being used. Built for developers who care about
            performance.
          </p>

          {/* CTA row */}
          <div className="animate-fade-in-up animation-delay-300 mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#shorten"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-gray-800 hover:shadow-xl dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Create your short link
              <ArrowRight size={16} />
            </a>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-900"
            >
              View dashboard
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="animate-fade-in-up animation-delay-400 mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1.5">
              <Zap size={12} /> Fast redirects
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 size={12} /> Real-time analytics
            </span>
            <span className="flex items-center gap-1.5">
              <Tag size={12} /> Custom aliases
            </span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  URL SHORTENER CARD                                          */}
      {/* ============================================================ */}
      <Section id="shorten" className="relative pb-20 sm:pb-28">
        <div className="animate-fade-in-up animation-delay-300 mx-auto max-w-2xl">
          <div className="glow-border rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 dark:bg-white">
                <Link2 size={18} className="text-white dark:text-gray-900" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Shorten your URL</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Paste a link and get a short one in seconds.
                </p>
              </div>
            </div>
            <CreateUrlForm />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  FEATURES                                                    */}
      {/* ============================================================ */}
      <Section className="border-t border-gray-100 py-20 dark:border-gray-900 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Features
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            More than just a URL shortener. A complete link management platform.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, color, iconColor }) => (
            <div
              key={title}
              className={`group rounded-2xl border border-gray-200 bg-gradient-to-br p-6 transition-all hover:shadow-lg hover:-translate-y-0.5 dark:border-gray-800 ${color}`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-gray-900 ${iconColor}`}
              >
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PRODUCT PREVIEW (Dashboard mockup)                          */}
      {/* ============================================================ */}
      <Section className="py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Dashboard
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to understand your links
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Track performance and understand how your links are being used.
          </p>
        </div>

        {/* Dashboard mockup card */}
        <div className="animate-fade-in-up mt-14 rounded-2xl border border-gray-200 bg-gray-50/50 p-4 shadow-2xl shadow-gray-200/50 sm:p-8 dark:border-gray-800 dark:bg-gray-900/50 dark:shadow-none">
          {/* Fake browser chrome */}
          <div className="mb-6 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="ml-4 h-5 flex-1 rounded-md bg-gray-200 dark:bg-gray-800" />
          </div>

          {/* Stats row */}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Total URLs',
                value: stats.data?.totalUrls ?? '—',
                icon: Link2,
              },
              {
                label: 'Active URLs',
                value: stats.data?.activeUrls ?? '—',
                icon: Activity,
              },
              {
                label: 'Total clicks',
                value: stats.data?.totalClicks ?? '—',
                icon: MousePointerClick,
              },
              {
                label: 'Clicks today',
                value: stats.data?.clicksToday ?? '—',
                icon: BarChart3,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <Icon size={14} className="text-gray-400 dark:text-gray-600" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
            <p className="mb-4 text-sm font-medium">Clicks over time</p>
            <div className="flex h-32 items-end gap-1.5">
              {[40, 65, 45, 80, 55, 90, 70, 95, 60, 75, 85, 50].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-700"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-gray-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>

          {/* Breakdown row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: 'Top countries',
                items: ['India', 'United States', 'Germany'],
              },
              {
                title: 'Devices',
                items: ['Mobile', 'Desktop', 'Tablet'],
              },
              {
                title: 'Browsers',
                items: ['Chrome', 'Safari', 'Firefox'],
              },
            ].map(({ title, items }) => (
              <div
                key={title}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
              >
                <p className="mb-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {title}
                </p>
                {items.map((item, i) => (
                  <div key={item} className="flex items-center justify-between py-1.5">
                    <span className="text-sm">{item}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full bg-gray-900 dark:bg-gray-400"
                        style={{ width: `${100 - i * 30}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                */}
      {/* ============================================================ */}
      <Section className="border-t border-gray-100 py-20 dark:border-gray-900 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to a shorter link
          </h2>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {STEPS.map(({ num, title, desc }, i) => (
            <div key={num} className="relative text-center">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="absolute left-[calc(50%+40px)] top-6 hidden h-px w-[calc(100%-80px)] bg-gray-200 sm:block dark:bg-gray-800" />
              )}
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
                {num}
              </div>
              <h3 className="mt-5 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  TECH STACK                                                  */}
      {/* ============================================================ */}
      <Section className="py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Built for speed
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Powered by proven technology
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Redis caching for fast redirects. PostgreSQL for reliable storage.
            RabbitMQ for async event processing.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TECH.map(({ name, desc }) => {
            const icons: Record<string, typeof Server> = {
              Express: Server,
              PostgreSQL: Database,
              Redis: Activity,
              RabbitMQ: Globe,
            };
            const Icon = icons[name] ?? Server;
            return (
              <div
                key={name}
                className="group rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <Icon
                  size={20}
                  className="text-gray-400 transition-colors group-hover:text-gray-900 dark:group-hover:text-white"
                />
                <p className="mt-3 text-sm font-semibold">{name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  FINAL CTA                                                   */}
      {/* ============================================================ */}
      <Section className="py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 px-6 py-16 text-center dark:border-gray-800 dark:bg-gray-900 sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-gray-200/50 blur-3xl dark:bg-gray-800/50" />
            <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-gray-200/50 blur-3xl dark:bg-gray-800/50" />
          </div>
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to shorten your links?
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-gray-500 dark:text-gray-400">
            Create your first short link in seconds. No signup required.
          </p>
          <div className="relative mt-8">
            <a
              href="#shorten"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-gray-800 hover:shadow-xl dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Create a short URL
              <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            {/* Brand */}
            <div>
              <Link href="/" className="flex items-center">
                <Logo size={22} />
              </Link>
              <p className="mt-3 max-w-xs text-sm text-gray-500 dark:text-gray-400">
                Simple links. Powerful insights.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="mt-3 space-y-2">
                {[
                  { href: '/dashboard', label: 'Dashboard' },
                  { href: '/create', label: 'Create' },
                  { href: '/urls', label: 'My URLs' },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <p className="text-sm font-semibold">Resources</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link
                    href="/dashboard"
                    className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    Documentation
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/nayan-kunwar/shortly"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              &copy; {new Date().getFullYear()} Shortly. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
