'use client';

import { LayoutDashboard, Link2, ListOrdered, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/** Single source of truth for product navigation (sidebar + mobile nav). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/create', label: 'Create', icon: Link2 },
  { href: '/urls', label: 'My URLs', icon: ListOrdered },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Client island: only the active-link highlight needs interactivity. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  active
                    ? 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900/50'
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
