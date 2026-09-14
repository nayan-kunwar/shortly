'use client';

import { usePathname } from 'next/navigation';
import { Navbar, Sidebar } from './navbar';

/**
 * Client shell that conditionally renders the sidebar. The landing page
 * (/) gets a clean full-width layout; all other routes keep the sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/';

  if (isHome) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-full max-w-4xl px-4 py-8">{children}</main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="mx-auto flex max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-8">{children}</main>
      </div>
    </>
  );
}
