import Link from 'next/link';
import { NavLinks } from './nav-links';
import { ThemeToggle } from './theme-toggle';

/** Desktop top bar: brand, theme toggle. No JS except the toggle island. */
export function Navbar() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Shortly
        </Link>
        <ThemeToggle />
      </div>
      {/* Mobile nav: static links, no drawer JS needed at this scale. */}
      <div className="border-t border-gray-100 md:hidden dark:border-gray-900">
        <div className="mx-auto max-w-6xl overflow-x-auto px-4 py-2">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}

/** Desktop sidebar. Hidden on mobile (top nav covers it). Server-rendered. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-gray-200 p-4 md:block dark:border-gray-800">
      <NavLinks />
    </aside>
  );
}
