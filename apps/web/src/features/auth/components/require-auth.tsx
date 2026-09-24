'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../auth-context';

/** Sends anonymous visitors to sign in before private screens render. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || user === null) {
    return <p className="text-sm text-gray-500">Checking session…</p>;
  }
  return children;
}
