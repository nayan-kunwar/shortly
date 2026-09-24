'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../features/auth/auth-context';

/** Email and logout when a session exists; otherwise a sign-in link. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (user === null) {
    return (
      <Link
        href="/login"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-[12rem] truncate text-sm text-gray-600 dark:text-gray-400">{user.email}</span>
      <button
        type="button"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
        onClick={() => {
          void logout().then(() => router.replace('/login'));
        }}
      >
        Log out
      </button>
    </div>
  );
}
