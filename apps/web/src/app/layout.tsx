import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '../components/layout/theme-provider';
import { QueryProvider } from '../lib/query-client/provider';
import { AppShell } from '../components/layout/app-shell';

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
            <AppShell>{children}</AppShell>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
