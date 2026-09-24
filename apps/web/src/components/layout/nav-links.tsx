'use client';

import { LayoutDashboard, Link2, ListOrdered } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/** Single source of truth for product navigation (sidebar + mobile nav). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/create', label: 'Create', icon: Link2 },
  { href: '/urls', label: 'My URLs', icon: ListOrdered },
];

/** Client island: only the active-link highlight needs interactivity. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900/50 dark:hover:text-white'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-500"
                  />
                )}
                <Icon size={18} aria-hidden="true" className={active ? 'text-brand-600 dark:text-brand-400' : ''} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
