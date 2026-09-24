import Link from 'next/link';
import { NavLinks } from './nav-links';
import { ThemeToggle } from './theme-toggle';
import { Logo } from '../../components/ui/logo';
import { UserMenu } from './user-menu';

/** Top bar: slim, white, theme toggle. No JS except the toggle island. */
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface dark:border-gray-800 dark:bg-gray-950">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center md:hidden">
          <Logo size={30} />
        </Link>
        <div className="hidden md:block" />
        <div className="flex items-center gap-2">
          <UserMenu />
          <ThemeToggle />
        </div>
      </div>
      {/* Mobile nav: static links, no drawer JS needed at this scale. */}
      <div className="border-t border-line md:hidden dark:border-gray-800">
        <div className="overflow-x-auto px-4 py-2">
          <NavLinks />
        </div>
      </div>
    </header>
  );
}

/** Desktop sidebar. Hidden on mobile (top nav covers it). Server-rendered. */
export function Sidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex dark:border-gray-800 dark:bg-gray-950">
      <Link
        href="/create"
        className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
      >
        Create
      </Link>
      <NavLinks />
      <div className="mt-auto hidden md:block">
        <div className="border-t border-line pt-4 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Shortly — link management
          </p>
        </div>
      </div>
    </aside>
  );
}
