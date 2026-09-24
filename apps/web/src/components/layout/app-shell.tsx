'use client';

import { usePathname } from 'next/navigation';
import { Navbar, Sidebar } from './navbar';
import { LandingNavbar } from './landing-navbar';
import { RequireAuth } from '../../features/auth/components/require-auth';

/**
 * Client shell that conditionally renders the sidebar. The landing page
 * (/) gets a clean full-width layout with its own navbar; all other
 * routes keep the sidebar layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (isHome) {
    return (
      <>
        <LandingNavbar />
        <main>{children}</main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="mx-auto min-w-0 max-w-6xl flex-1 px-4 py-8 md:px-8">
          <RequireAuth>{children}</RequireAuth>
        </main>
      </div>
    </>
  );
}
