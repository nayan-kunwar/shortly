import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { Navbar, Sidebar } from '../components/layout/navbar';
import { ThemeProvider } from '../components/layout/theme-provider';
import { QueryProvider } from '../lib/query-client/provider';

export const metadata: Metadata = {
  title: 'Shortly — URL Shortener',
  description: 'Create short URLs and explore click analytics.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class post-hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <Navbar />
            <div className="mx-auto flex max-w-6xl">
              <Sidebar />
              <main className="min-w-0 flex-1 px-4 py-8">{children}</main>
            </div>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
