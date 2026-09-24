import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '../components/layout/theme-provider';
import { QueryProvider } from '../lib/query-client/provider';
import { AuthProvider } from '../features/auth/auth-context';
import { AppShell } from '../components/layout/app-shell';

export const metadata: Metadata = {
  title: 'Shortly — URL Shortener',
  description: 'Create short URLs and explore click analytics.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class post-hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
