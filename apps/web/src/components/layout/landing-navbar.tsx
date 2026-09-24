'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { Logo } from '../../components/ui/logo';
import { UserMenu } from './user-menu';
import { useAuth } from '../../features/auth/auth-context';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/create', label: 'Create' },
  { href: '/urls', label: 'My URLs' },
] as const;

const linkClass =
  'rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-300';

/**
 * Landing page navbar. Auth-aware: guests see Sign in + Get started only
 * (app links would just bounce through the guard to /login); signed-in
 * users get the app links plus their account menu.
 */
export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const authed = user !== null;

  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-surface/80 backdrop-blur-lg dark:border-gray-800/60 dark:bg-gray-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center">
          <Logo size={36} />
        </Link>

        {/* Desktop nav: app links for signed-in users only */}
        {authed && (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoading ? null : authed ? (
            <UserMenu />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700 md:inline-flex dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="hidden rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-600 hover:shadow-lg md:inline-flex"
              >
                Get started
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface md:hidden dark:border-gray-700 dark:bg-gray-900"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-line bg-surface px-4 py-4 dark:border-gray-800 dark:bg-gray-950 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {authed &&
              NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
                >
                  {item.label}
                </Link>
              ))}
            {isLoading ? null : authed ? (
              <div className="mt-2 border-t border-line pt-3 dark:border-gray-800">
                <UserMenu />
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-lg bg-brand-500 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-600"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
