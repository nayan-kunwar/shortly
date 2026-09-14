'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { Logo } from '../../components/ui/logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/create', label: 'Create' },
  { href: '/urls', label: 'My URLs' },
] as const;

/** Landing page navbar: clean, sticky, with mobile hamburger menu. */
export function LandingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/80 backdrop-blur-lg dark:border-gray-800/60 dark:bg-gray-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center">
          <Logo size={36} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="hidden rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 hover:shadow-lg dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 md:inline-flex"
          >
            Get started
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 md:hidden dark:border-gray-800"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-gray-900"
            >
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
