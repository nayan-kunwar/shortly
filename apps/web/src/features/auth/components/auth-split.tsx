import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, Link2, Zap } from 'lucide-react';
import type { ReactNode } from 'react';

const POINTS = [
  { icon: Zap, text: 'Sub-50ms redirects, cached at the edge of the stack' },
  { icon: BarChart3, text: 'Real-time analytics on every click' },
  { icon: Link2, text: 'Custom aliases that carry your brand' },
] as const;

/**
 * Split-screen auth shell. Left: decorative brand panel (hidden on mobile).
 * Right: centered minimalist form column. AuthForm logic stays untouched —
 * this component only owns layout and the visual panel.
 */
export function AuthSplit({
  kicker,
  children,
}: {
  kicker: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-surface dark:bg-gray-950">
      {/* Brand panel — pure CSS visual, no image assets (retheme-safe). */}
      <div
        aria-hidden="true"
        className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 lg:block dark:from-[#1c0a0e] dark:via-brand-950 dark:to-brand-900"
      >
        {/* Abstract orbs */}
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-brand-300/30 blur-3xl dark:bg-brand-500/20" />
        <div className="absolute left-1/3 top-1/3 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Panel content */}
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <Image src="/favicon.png" alt="" width={36} height={36} className="rounded-md" />
            <span className="text-xl font-bold tracking-tight text-white">Shortly</span>
          </div>
          <div>
            <p className="text-3xl font-extrabold leading-tight tracking-tight text-white">
              Short links.
              <br />
              Powerful analytics.
            </p>
            <ul className="mt-8 space-y-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Icon size={15} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/60">Simple links. Powerful insights.</p>
        </div>
      </div>

      {/* Form column */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <Image src="/favicon.png" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              Shortly
            </span>
          </Link>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
            {kicker}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
